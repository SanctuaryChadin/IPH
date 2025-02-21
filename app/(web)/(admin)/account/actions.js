// app/(web)/(admin)/account/actions.js
'use server';

import { dbQuery,runTransaction,pool } from '@/lib/db.js';
import { z } from 'zod';
import { validateAndSanitize } from '@/modules/sanitizeService.js';
import { queueEmailTask } from '@/modules/taskServices.js';
import { getNeighborSlotMap } from '@/modules/neighborSlotService.js';

////////////////////////////////////////////////////
// SCHEMAS
////////////////////////////////////////////////////
const SearchSchema = z.object({
  filterBy: z.enum(['id','name','role']).optional(),
  searchQuery: z.string().optional(),
  page: z.coerce.number().default(1)
});

const CreatePartnerSchema = z.object({
  clubName: z.string().min(1),
  repName: z.string().min(1),
  partnerEmail: z.string().email(),
  phone: z.string().regex(/^[0-9]{10}$/),
  point: z.coerce.number().min(0),
  line: z.string().min(1)
});

// For approving a pending account. 
// The admin can supply a 'note' (optional).
const ApproveSchema = z.object({
  accountId: z.string().min(1),
  note: z.string().optional(), 
});

// For rejecting a pending account. 
// The user can supply both a 'note' (optional) 
// and a 'reason' (which is mandatory for the actual rejection).
// We also handle an optional 'banThisEmail' boolean.
const RejectSchema = z.object({
  accountId: z.string().min(1),
  note: z.string().optional(),
  reason: z.string().min(5, "Reject reason must be at least 5 chars"),
  banThisEmail: z.boolean().optional(),
});





/*****************************************************
 * 1) SEARCH ACCOUNTS (with transaction optional)
 *    and a department join for abbreviation
 *****************************************************/
export async function searchActiveAccounts(filterBy, searchQuery, page) {
  // Reuse your schema + sanitize logic:
  const rawInput = { filterBy, searchQuery, page };
  const { valid, data } = validateAndSanitize(rawInput, SearchSchema);
  if (!valid) {
    return {
      error: 'Invalid search input',
      accounts: [],
      totalCount: 0,
      page: 1
    };
  }

  let { filterBy: fBy, searchQuery: sQuery, page: pg } = data;
  if (pg < 1) pg = 1;

  const limit = 10;
  const offset = (pg - 1)*limit;

  let where = `WHERE a."role" NOT IN ('delete','pending')`;
  const params = [];

  if (sQuery) {
    if (fBy==='id') {
      where += ` AND a."id" ILIKE $1`;
    } else if (fBy==='name') {
      where += ` AND a."name" ILIKE $1`;
    } else if (fBy==='role') {
      where += ` AND a."role" ILIKE $1`;
    }
    params.push(`%${sQuery}%`);
  }

  // Count
  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM "account" a
    ${where}
  `;
  const countRes = await dbQuery(countSql, params);
  const totalCount = parseInt(countRes.rows[0]?.cnt || '0', 10);
  const maxPage = Math.ceil(totalCount/limit) || 1;

  if (pg > maxPage) {
    return {
      error: `Page ${pg} exceeds max page ${maxPage}.`,
      accounts: [],
      totalCount,
      page: maxPage
    };
  }

  // Main query
  const mainSql = `
    SELECT 
      a."id", 
      a."name", 
      a."role", 
      a."year",
      d."abbreviation" AS "departmentAbbrev"
    FROM "account" a
    LEFT JOIN "department" d ON a."departmentId" = d."id"
    ${where}
    ORDER BY a."id" ASC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const mainRows = await dbQuery(mainSql, params);

  return {
    error: null,
    accounts: mainRows.rows,
    totalCount,
    page: pg
  };
}

/*****************************************************
 * 2) CREATE PARTNER ACCOUNT (like old admin PHP)
 *    in a single transaction
 *    combine ban-check + existing-check
 *****************************************************/
export async function createPartnerAccount(_,formData) {
  const raw = Object.fromEntries(formData.entries());
  const { valid, data, errors } = validateAndSanitize(raw, CreatePartnerSchema);
  if (!valid) {
    // Return field-level errors that the client can read
    return {
      ok: false,
      fieldErrors: errors, // { clubName: ["Club Name is required"], ... }
    };
  }

  let { clubName, repName, partnerEmail, phone, point, line } = data;

  // We'll do everything in a transaction
  try {
    const result = await runTransaction(async (client) => {
      // Combine ban-check & existing-check in a single query
      const comboSql = `
        SELECT 
          (SELECT COUNT(*) FROM "ban" WHERE "email"=$1) AS bancount,
          (SELECT COUNT(*) FROM "account" WHERE "email"=$1 AND "role"<>'delete') AS usedcount
      `;
      const comboRes = await client.query(comboSql, [partnerEmail]);
      const { bancount, usedcount } = {
        bancount: parseInt(comboRes.rows[0].bancount,10),
        usedcount: parseInt(comboRes.rows[0].usedcount,10)
      };

      if (bancount>0) {
        throw new Error('This email is banned.');
      }
      if (usedcount>0) {
        throw new Error('Email already in use.');
      }

      // 3) generate ID
      let finalId;
      if (partnerEmail.endsWith('@student.chula.ac.th')) {
        // do suffix approach
        finalId = await generateSuffixId(partnerEmail.slice(0,10), client);
      } else {
        // fallback
        finalId = await generateYearId(client);
      }

      // Insert role='user', deptId=14, year=1, address=clubName, note=..., club=true
      const role = 'user';
      const deptId = 14;
      const year = 1;
      const address = clubName; // from old code logic
      const note = `Partner Club. Representative: ${repName}`;

      const insertSql = `
        INSERT INTO "account"
        ("id","email","name","departmentId","year","role",
         "phone","lineId","address","point","note","club","approveAt")
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
      `;
      const insertParams = [
        finalId,
        partnerEmail,
        clubName,
        deptId,
        year,
        role,
        phone,
        line,
        address,
        point,
        note,
        true
      ];
      await client.query(insertSql, insertParams);

      // queue email => "register_create"
      await queueEmailTask({
        email_case: 'register_create',
        recipient: partnerEmail,
        variables: { name: clubName }
      });

      return finalId;
    }); // end runTransaction

    return { ok: true, accountId: result };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/*****************************************************
 * HELPER: generateSuffixId(base, client)
 * In a single transaction for safety
 *****************************************************/
async function generateSuffixId(base, client) {
  const fetchSql=`
    SELECT "id" FROM "account"
    WHERE "id" LIKE $1
  `;
  const fetchRes = await client.query(fetchSql, [base + '%']);
  const existingIds = fetchRes.rows.map(r=>r.id);
  const existingSet = new Set(existingIds);

  let suffix = existingIds.length>0 ? existingIds.length+1 : 2;
  let finalId = base;
  while(existingSet.has(finalId) && suffix<5000) {
    finalId=`${base}V${suffix}`;
    suffix++;
  }
  if (suffix>=5000) {
    // fallback
    return await generateYearId(client);
  }
  return finalId;
}

/*****************************************************
 * HELPER: generateYearId => old code logic
 *   uses Buddhist year
 *****************************************************/
async function generateYearId(client) {
  const now = new Date();
  const currentYear = now.getFullYear(); // e.g. 2023
  const thaiYear = currentYear + 543;    // e.g. 2566
  const yearSuffix = String(thaiYear).slice(-2) + '0'; // e.g. '66' + '0' => '660'

  // find highest that starts with '660'...
  const prefix = yearSuffix;
  const sql = `
    SELECT "id"
    FROM "account"
    WHERE "id" LIKE $1
      AND LENGTH("id")=10
      AND "id" ~ '^[0-9]+$'
    ORDER BY "id" DESC
    LIMIT 1
  `;
  const res = await client.query(sql, [prefix + '%']);
  if (res.rowCount>0) {
    const highestId = res.rows[0].id;
    const nextVal = parseInt(highestId,10)+1;
    const accountId = String(nextVal).padStart(10,'0');
    return accountId;
  } else {
    return prefix + '0000001';
  }
}

export async function approveAccount(accountId, note = "") {
  // Step 1) Validate & sanitize inputs
  const raw = { accountId, note };
  const { valid, data, errors } = validateAndSanitize(raw, ApproveSchema);

  if (!valid) {
    // Return structured errors for your client code to handle
    return { error: "Invalid input", fieldErrors: errors };
  }

  // Step 2) Transaction
  try {
    const result = await runTransaction(async (client) => {
      // We'll update the row if role='pending'
      // We'll store the note if provided (appending or overwriting is up to you).
      // If you only want to set the note if it's non-empty, you can do a CASE expression.
      // Or simply overwrite the existing note with data.note.
      const sql = `
        WITH updated AS (
          UPDATE "account"
          SET "role"='user',
              "approveAt"=NOW(),
              "note" = CASE WHEN LENGTH($2) > 0 
                            THEN $2 
                            ELSE NULL 
                       END
          WHERE "id"=$1
            AND "role"='pending'
          RETURNING "email","name"
        )
        SELECT * FROM updated
      `;
      const res = await client.query(sql, [
        data.accountId,
        data.note || "",
      ]);
      if (res.rowCount < 1) {
        throw new Error("Not found or not pending");
      }

      const { email, name } = res.rows[0];

      // queue "register_accept" email
      await queueEmailTask({
        email_case: "register_accept",
        recipient: email,
        variables: { name },
      });

      return { email, name };
    });

    return { success: true, ...result };
  } catch (err) {
    return { error: err.message };
  }
}

/*****************************************************
 * 4) REJECT PENDING => single statement with CTE
 *    + store reason in note
 *    + ban if needed
 *    + return oldEmail for queue
 *****************************************************/
export async function rejectAccount(accountId, note = "", reason = "", banThisEmail = false) {
  // Step 1) Validate & sanitize
  const raw = { accountId, note, reason, banThisEmail };
  const { valid, data, errors } = validateAndSanitize(raw, RejectSchema);

  if (!valid) {
    console.log(errors);
    return { error: "Invalid input", fieldErrors: errors };
  }

  // Combine the admin note with the "Reject Reason"
  // e.g. finalNote = old note + "\nReject Reason: reason"
  // If user didn't supply note, we just do "Reject Reason: reason".
  let finalNote = "";
  if (data.note && data.note.trim().length > 0) {
    finalNote = data.note + "\nReject Reason: " + data.reason;
  } else {
    finalNote = "Reject Reason: " + data.reason;
  }

  // Step 2) Transaction
  try {
    const result = await runTransaction(async (client) => {
      // Step 2.1) update role='delete', rename email, set note
      const updSql = `
        WITH old AS (
          SELECT "email","name"
          FROM "account"
          WHERE "id"=$1
            AND "role"='pending'
        ), updated AS (
          UPDATE "account"
          SET "role"='delete',
              "email"="account"."email" || '@DELETE' || "account"."id",
              "approveAt"=NOW(),
              "note"=$2
          FROM old
          WHERE "account"."id"=$1
            AND "account"."role"='pending'
          RETURNING old."email" AS oldEmail, old."name" AS oldName
        )
        SELECT * FROM updated
      `;

      const updRes = await client.query(updSql, [data.accountId, finalNote]);
      if (updRes.rowCount < 1) {
        throw new Error("Not found or not pending");
      }
      const { oldemail, oldname } = updRes.rows[0];

      // Step 2.2) If ban
      if (data.banThisEmail) {
        // concurrency check: if email used by active user
        const banCheckSql = `
          SELECT COUNT(*) AS cnt
          FROM "account"
          WHERE "email"=$1
            AND "role" IN ('admin','user','courier','pending')
        `;
        const banCheck = await client.query(banCheckSql, [oldemail]);
        const cnt = parseInt(banCheck.rows[0].cnt || "0", 10);
        if (cnt > 0) {
          throw new Error("Email belongs to an active user. Cannot ban now.");
        }

        // Insert into ban table
        const banSql = `
          INSERT INTO "ban"("email","reason","timestamp")
          VALUES($1,$2,NOW())
        `;
        await client.query(banSql, [oldemail, data.reason]);

        // optional email about "ban_account"
        await queueEmailTask({
          email_case: "ban_account",
          recipient: oldemail,
          variables: {
            name: oldname,
            reason: data.reason,
          },
        });
      }

      // Step 2.3) queue "register_reject" email
      // The reason is sent to the user, so they know why they're rejected
      await queueEmailTask({
        email_case: "register_reject",
        recipient: oldemail,
        variables: {
          name: oldname,
          reason: data.reason,
        },
      });

      return { oldEmail: oldemail, oldName: oldname };
    });

    return { success: true, ...result };
  } catch (err) {
    return { error: err.message };
  }
}

export async function searchPendingAccounts(page=1) {
  const limit = 10;
  const offset = (page - 1)*limit;

  // do a count
  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM "account"
    WHERE "role"='pending'
  `;
  const countRes = await dbQuery(countSql);
  const totalCount = parseInt(countRes.rows[0]?.cnt || '0',10);
  const maxPage = Math.ceil(totalCount/limit)||1;
  let finalPage = page;
  if (page>maxPage) finalPage = maxPage;

  // main fetch
  const mainSql = `
    SELECT "id","name","email","phone","createAt"
    FROM "account"
    WHERE "role"='pending'
    ORDER BY "createAt" ASC
    LIMIT ${limit}
    OFFSET ${(finalPage-1)*limit}
  `;
  const mainRes = await dbQuery(mainSql);

  return {
    error: null,
    pending: mainRes.rows,
    totalCount,
    page: finalPage
  };
}

/*****************************************************
 * 5) BAN / UNBAN
 *    in transaction as well
 *****************************************************/
export async function unbanEmail(email) {
  try {
    await runTransaction(async (client)=>{
      const sql = `DELETE FROM "ban" WHERE "email"=$1`;
      await client.query(sql,[email]);
    });
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
}

// 6) SEARCH BANNED EMAILS
//    Similar pattern to searchActiveAccounts or searchPendingAccounts
//    We'll let filterBy only search "email" or "reason", for example.
const BanSearchSchema = z.object({
  filterBy: z.enum(['email','reason']).optional(),
  searchQuery: z.string().optional(),
  page: z.coerce.number().default(1),
});

export async function searchBannedEmails(filterBy, searchQuery, page) {
  // Step 1) Zod validation
  const rawInput = { filterBy, searchQuery, page };
  const { valid, data } = validateAndSanitize(rawInput, BanSearchSchema);
  if (!valid) {
    return {
      error: 'Invalid search input',
      bans: [],
      totalCount: 0,
      page: 1,
    };
  }

  let { filterBy: fBy, searchQuery: sQuery, page: pg } = data;
  if (pg < 1) pg = 1;

  // Step 2) Build the WHERE logic
  let where = 'WHERE 1=1';   // We'll do "b." table alias
  const params = [];
  if (sQuery) {
    if (fBy === 'email') {
      where += ' AND b."email" ILIKE $1';
    } else if (fBy === 'reason') {
      where += ' AND b."reason" ILIKE $1';
    }
    params.push(`%${sQuery}%`);
  }

  // Step 3) Count total
  const limit = 10;
  const offset = (pg - 1) * limit;
  const countSql = `
    SELECT COUNT(*) AS cnt
    FROM "ban" b
    ${where}
  `;
  const countRes = await dbQuery(countSql, params);
  const totalCount = parseInt(countRes.rows[0]?.cnt || '0', 10);
  const maxPage = Math.ceil(totalCount / limit) || 1;
  if (pg > maxPage) {
    return {
      error: `Page ${pg} exceeds max page ${maxPage}.`,
      bans: [],
      totalCount,
      page: maxPage,
    };
  }

  // Step 4) Main query
  const mainSql = `
    SELECT b."email", b."reason", b."timestamp"
    FROM "ban" b
    ${where}
    ORDER BY b."timestamp" DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
  const mainRes = await dbQuery(mainSql, params);

  return {
    error: null,
    bans: mainRes.rows,  // array of { email, reason, userId, timestamp }
    totalCount,
    page: pg,
  };
}

export async function addBanEmail(email, reason='') {
  try {
    const result = await runTransaction(async (client)=>{
      // check usage
      const usageSql = `
        SELECT COUNT(*) AS cnt
        FROM "account"
        WHERE "email"=$1
          AND "role" IN ('admin','user','courier','pending')
      `;
      const usageRes = await client.query(usageSql, [email]);
      const usageCount = parseInt(usageRes.rows[0].cnt,10);
      if (usageCount>0) {
        throw new Error('Email belongs to an active user. Must delete user first.');
      }

      const insertSql = `INSERT INTO "ban"("email","reason") VALUES($1,$2)`;
      await client.query(insertSql, [email, reason]);

      // optionally queue "ban_account" email if you want
      await queueEmailTask({
        email_case: 'ban_account',
        recipient: email,
        variables: { reason }
      });
      return true;
    });
    return { success: result };
  } catch (err) {
    return { error: err.message };
  }
}

/*****************************************************
 * WHAT WE DID NOT IMPLEMENT
 *  - Full concurrency checks for "inhand" orders 
 *    or partial item refunds
 *  - Real-time WebSockets or SSE
 *  - A separate "create normal user" flow
 *  - Debounced search bar on client side
 *  - Possibly more advanced queries or role checks
 *****************************************************/


const ManageSchema = z.object({
  accountId: z.string().nonempty(),
  action: z.enum(["update", "delete"]),
  name: z.string().min(1, "Name required").optional(),
  department: z.coerce.number().int()
    .min(1, "Department must be between 1 and 14")
    .max(14, "Department must be between 1 and 14")
    .optional(),
  year: z.coerce.number().int()
    .min(1, "Year must be >=1")
    .max(8, "Year must be <=8")
    .optional(),
  phone: z.string().regex(/^[0-9]{10}$/, "Phone must be exactly 10 digits").optional(),
  lineId: z.string().max(32, "Line ID cannot exceed 32 chars").optional(),
  address: z.string().optional(),
  note: z.string().optional(),
  role: z.enum(["user", "courier", "admin"]).optional(),
  point: z.coerce.number().min(0, "Points cannot be negative").optional(),

  banEmail: z.string().optional(),
  banReason: z.string().optional(),

  // Use z.coerce.boolean() so that "true"/"false" strings become booleans
  // or it can accept actual booleans from the client
  confirmCancel: z.coerce.boolean().optional().default(false),

  // Similarly for club
  club: z.coerce.boolean().optional().default(false),
});

export async function manageAccountAction(payload, externalClient = null) {
  let client = externalClient;
  let createdLocalClient = false;

  if (!client) {
    client = await pool.connect();
    createdLocalClient = true;
    await client.query('BEGIN');
  }
  try {
    // 1) Validate & sanitize with Zod (or your validator)
    const { valid, data, errors } = validateAndSanitize(payload, ManageSchema);
    if (!valid) {
      if (createdLocalClient) await client.query('ROLLBACK');
      return { ok: false, fieldErrors: errors };
    }

    // 2) fetch the account
    const sql = `SELECT * FROM "account" WHERE "id"=$1 AND "role" NOT IN ('delete','pending')`;
    const res = await client.query(sql, [data.accountId]);
    if (res.rowCount < 1) {
      if (createdLocalClient) await client.query('ROLLBACK');
      return { ok: false, error: "Account not found" };
    }
    const account = res.rows[0];

    // 3) if data.action='delete', handleDelete; otherwise handleUpdate
    let result;
    if (data.action === 'delete') {
      result = await handleDelete(client, account, data);
    } else {
      result = await handleUpdate(client, account, data);
    }
    if (!result.ok) {
      if (createdLocalClient) await client.query('ROLLBACK');
      return result;
    }

    const finalCheckRes = await finalConcurrencyCheck(client, account, data, result);
    if (!finalCheckRes.ok) {
      if (createdLocalClient) await client.query('ROLLBACK');
      return finalCheckRes;
    }

    // 6) All good => commit
    if (createdLocalClient) {
      await client.query('COMMIT');
    }
    return result;

  } catch (err) {
    if (createdLocalClient) {
      await client.query('ROLLBACK');
    }
    return { ok: false, error: err.message };
  } finally {
    if (createdLocalClient && client) {
      client.release();
    }
  }
}

/** handleUpdate => also handle concurrency if role changed */
async function handleUpdate(client, account, data) {
  const oldRole = account.role;
  const newRole = data.role || oldRole;

  // concurrency checks if role changed
  if (oldRole !== newRole) {
    const rc = await handleRoleChange(client, account, oldRole, newRole, data);
    if (!rc.ok) {
      return rc; // concurrency or error
    }
  }
  // 2) Prepare 'club' or other fields
  let newClub = data.club ?? account.club;
  if(newClub && newRole !== 'user'){
    newClub = false;
  }
  
  // 3) finalPoint if user
  let finalPoint = null;
  if (newRole === 'user') {
    // Zod ensures data.point >= 0. If missing => 0
    finalPoint = data.point ?? 0;
  }

  // 4) do the update
  const updSql = `
    UPDATE "account"
    SET
      "name"=$2,
      "departmentId"=$3,
      "year"=$4,
      "phone"=$5,
      "lineId"=$6,
      "address"=$7,
      "note"=$8,
      "role"=$9,
      "point"=$10,
      "club"=$11
    WHERE "id"=$1
      AND "role"<>'delete'
  `;
  try {
    await client.query(updSql, [
      account.id,
      data.name ?? account.name,
      data.department ?? account.departmentId,
      data.year ?? account.year,
      data.phone ?? account.phone,
      data.lineId ?? account.lineId,
      data.address ?? account.address,
      data.note ?? account.note,
      newRole,
      finalPoint,
      newClub
    ]);

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
/**********************************************************
 * handleRoleChange
 * user->courier => order-based concurrency
 * courier->user => slot-based concurrency
 * admin->courier => trivial
 * etc.
 **********************************************************/
async function handleRoleChange(client, account, oldRole, newRole, data) {
  // e.g. user->courier => in-hand or pending => we do forced cancel after confirmation
  if (oldRole==='user' && (newRole==='courier'||newRole==='admin')) {
    const { inHand, pending } = await dummyCheckOrders(client, account.id);
    // if function supports passing client
    if ((inHand.length>0 || pending.length>0) && !data.confirmCancel) {
      return {
        ok: false,
        concurrency: true,
        inHand,
        pending,
        requiredAction: 'PROMOTE'
      };
    }
        // forced => doCancelOrders
        if (inHand.length>0 || pending.length>0) {
          const cRes = await doCancelOrders(client, [...inHand, ...pending], `Promote user->${newRole}`);
          if (!cRes.ok) return cRes;
        }

        await insertTasks(client, [{
          type: 'email',
          status: 'pending',
          emailCase: 'role_change',           // or any emailCase name you have
          recipientEmail: account.email,
          variables: {
            name: account.name,
            old_role: oldRole,
            new_role: newRole
          }
        }]);

        return { ok: true };
      }

  // courier->user or admin->user
  if ((oldRole === 'courier' || oldRole === 'admin') && newRole === 'user') {
    const { inHand, pending } = await dummyCheckSlotsAndOrders(client, account.id);
    if (inHand.length > 0) {
      return {
        ok: false,
        concurrency: true,
        inHand:groupSlotOrders(inHand),
        pending:groupSlotOrders(pending),
        requiredAction: 'CANNOT_DEMOTE_INHAND'
      };
    }
    if (pending.length > 0 && !data.confirmCancel) {
      return {
        ok: false,
        concurrency: true,
        pending:groupSlotOrders(pending),
        requiredAction: 'DEMOTE'
      };
    }
    // forced => doCancelSlots
    if (pending.length > 0) {
      const slotIds = [...new Set(pending.map(o => o.slotId))];
      const sRes = await doCancelSlots(
        client,
        slotIds,
        `Demote staff`,
      );
      if (!sRes.ok) return sRes;
    }

    await insertTasks(client, [{
      type: 'email',
      status: 'pending',
      emailCase: 'role_change',           // or any emailCase name you have
      recipientEmail: account.email,
      variables: {
        name: account.name,
        old_role: oldRole,
        new_role: newRole
      }
    }]);

    return { ok: true };
  }

  await insertTasks(client, [{
    type: 'email',
    status: 'pending',
    emailCase: 'role_change',           // or any emailCase name you have
    recipientEmail: account.email,
    variables: {
      name: account.name,
      old_role: oldRole,
      new_role: newRole
    }
  }]);
  // admin <-> courier => skip concurrency
  return { ok: true };
}

/**********************************************************
 * handleDelete
 * - If admin => block "Demote first"
 * - If user => do order-based concurrency
 * - If courier => do slot-based concurrency
 **********************************************************/
async function handleDelete(client, account, data) {
  // 1) If admin => block
  if (account.role === 'admin') {
    return { ok: false, error: "Cannot delete admin. Demote first." };
  }

  // 2) If user => order-based concurrency
  if (account.role === 'user') {
    const { inHand, pending } = await dummyCheckOrders(client, account.id);
    // If inHand => immediate block
    if (inHand.length > 0) {
      return {
        ok: false,
        concurrency: true,
        inHand,
        pending,
        requiredAction: 'CANNOT_DELETE_USER_INHAND'
      };
    }
   // If pending => confirm
   if (pending.length > 0 && !data.confirmCancel) {
    return {
      ok: false,
      concurrency: true,
      pending,
      requiredAction: 'DELETE'
    };
  }
   // forced cancel => doCancelOrders
   if (pending.length > 0) {
    const cRes = await doCancelOrders(client, pending, `Account deletion (user)`);
    if (!cRes.ok) return cRes;
  }

    // then remove sessions, rename email, ban
    return await finalizeDelete(client, account, data);
  }

  // If courier or admin => we do a special slot-based approach:
  // Actually, your code says "if admin => block." So only possibility left is 'courier'
  // or 'admin' if we've hit here. We'll keep a check just in case:
  if (account.role === 'courier') {
    const { inHand, pending } = await dummyCheckSlotsAndOrders(client, account.id);
    if (inHand.length > 0) {
      // block
      return {
        ok: false,
        concurrency: true,
        inHand:groupSlotOrders(inHand),
        pending:groupSlotOrders(pending),
        requiredAction: 'CANNOT_DELETE_COURIER_INHAND'
      };
    }
    // if only pending => must confirm
    if (pending.length>0 && !data.confirmCancel) {
      return {
        ok:false,
        concurrency:true,
        pending:groupSlotOrders(pending),
        requiredAction:'DELETE'
      };
    }
   // forced => doCancelSlots (in bulk)
   if (pending.length > 0) {
    // gather distinct slotIds from pending array
    const slotIds = [...new Set(pending.map(o => o.slotId))];
    const slotRes = await doCancelSlots(
      client,
      slotIds,
      `Delete courier => forcibly cancel slots`,
    );
    if (!slotRes.ok) return slotRes;
  }
  // finalize
  return await finalizeDelete(client, account, data);
}

// fallback if role something else
return { ok: false, error: `Cannot delete role=${account.role}` };
}

/** finalizeDelete => actually remove sessions, rename email, ban if needed */
async function finalizeDelete(client, account, data) {
  try {
    // remove sessions
    const oldEmail = account.email;
    const oldName = account.name;

    await client.query(`DELETE FROM "session" WHERE "userId"=$1`, [account.id]);

    // rename email => role='delete'
    const newEmail = account.email + '@DELETE' + account.id;
    await client.query(
      `
      UPDATE "account"
      SET "role"='delete', "email"=$2, "note"=$3
      WHERE "id"=$1
      `,
      [account.id, newEmail, (data.note ?? account.note) + "\nReason: " + data.banReason]
    );// We use same banReason for same with ban if ban check banReason just name of reason

    await insertTasks(client, [{
      type: 'email',
      status: 'pending',
      emailCase: 'delete_account',
      recipientEmail: oldEmail,  // send to their original email
      variables: {
        name: oldName            // e.g., "John"
      }
    }]);

    // ban if needed
    if (data.banEmail === 'true') {
      await client.query(
        `
        INSERT INTO "ban"("email","reason","timestamp")
        VALUES($1,$2,NOW())
        `,
        [account.email, data.banReason ?? "No reason"]
      );

      await insertTasks(client, [{
        type: 'email',
        status: 'pending',
        emailCase: 'ban_account',
        recipientEmail: oldEmail,    // notify them at oldEmail
        variables: {
          name: oldName,
          reason: data.banReason ?? "No reason"
        }
      }]);

    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function finalConcurrencyCheck(client, account, data) {
  const oldRole = account.role;
  const newRole = data.role || oldRole;

  // concurrency checks if role changed
  if ((oldRole !== newRole)|| data.action === 'delete') {

  if (oldRole === 'user') {
    const { inHand, pending } = await dummyCheckOrders(client, account.id);
    if (inHand.length>0 || pending.length>0) {
      return {
        ok:false,
        concurrency:true,
        inHand,
        pending,
        requiredAction:'RETRY' // or something
      };
    }
  } 
  else if (data.action === 'delete' || ((oldRole === 'courier' || oldRole === 'admin') && newRole === 'user')) {
    const { inHand, pending } = await dummyCheckSlotsAndOrders(client, account.id);
    if (inHand.length>0 || pending.length>0) {
      return {
        ok:false,
        concurrency:true,
        inHand:groupSlotOrders(inHand),
        pending:groupSlotOrders(pending),
        requiredAction:'RETRY' // or something
      };
    }
  } 
  }
  return { ok:true };
}

// EXAMPLE concurrency stubs for reference:
/**********************************************************
 * dummyCheckOrders(client, userId)
 * returns { inHand: [...], pending: [...] }
 * Each is an array of orderIds
 **********************************************************/
async function dummyCheckOrders(client, userId) {
  const statuses = [
    'pending',
    'waitForDelivery',
    'inHand',
    'lateForDelivery',
    'lateForReturn',
  ];
  const sql = `
    SELECT "id","status"
    FROM "order"
    WHERE "clientId"=$1
      AND "status"=ANY($2)
  `;
  const res = await client.query(sql, [userId, statuses]);

  const inHandSt = new Set(['inHand','lateForReturn']);
  const canSt    = new Set(['pending','waitForDelivery','lateForDelivery']);

  const inHand = [];
  const pending = [];
  for (let row of res.rows) {
    if (inHandSt.has(row.status)) {
      inHand.push(row.id);
    } else if (canSt.has(row.status)) {
      pending.push(row.id);
    }
  }
  return { inHand, pending };
}

/**********************************************************
 * dummyCheckSlotsAndOrders(client, staffId)
 * returns { inHand: [...], pending: [...] }
 * Each element is { orderId, slotId, orderStatus, slotStatus }
 **********************************************************/
async function dummyCheckSlotsAndOrders(client, staffId) {
  const slotSt = ['open','hidden'];
  const orderSt= ['pending','waitForDelivery','inHand','lateForDelivery','lateForReturn'];
  const sql= `
    SELECT 
      o."id" as "orderId", 
      o."status" as "orderStatus",
      s."id" as "slotId",
      s."status" as "slotStatus"
    FROM "slot" s
    JOIN "order" o ON o."slotId"=s."id"
    WHERE s."staffId"=$1
      AND s."status"=ANY($2)
      AND o."status"=ANY($3)
  `;
  const res = await client.query(sql, [staffId, slotSt, orderSt]);

  const inHandSt = new Set(['inHand','lateForReturn']);
  const canSt    = new Set(['pending','waitForDelivery','lateForDelivery']);

  const inHand = [];
  const pending = [];
  for (let row of res.rows) {
    if (inHandSt.has(row.orderStatus)) {
      inHand.push({
        orderId: row.orderId,
        slotId: row.slotId,
      });
    } else if (canSt.has(row.orderStatus)) {
      pending.push({
        orderId: row.orderId,
        slotId: row.slotId
      });
    }
  }
  return { inHand, pending };
}
/**
 * doCancelOrders(orderIds, options)
 * 
 * Bulk-cancels a set of orders. 
 * Also sends 2 emails per order:
 *   - user => order_cancel_user
 *   - staff => order_cancel_staff
 */
export async function doCancelOrders(client, orderIds, reason='Forced cancellation') {
  try {
  if (!orderIds || !orderIds.length) {
    return { ok:false, error:"No order IDs provided" };
  }
  // 1) SELECT relevant items from itemInOrder + user/staff
  const placeholders = orderIds.map((_, i) => `$${i+1}`).join(',');
  const sql = `
    WITH valid AS (
      SELECT o."id" as "orderId",
             o."clientId",
             o."slotId",
             i."itemId",
             i."point" as "itemPoint",
             i."refunded"
      FROM "order" o
      JOIN "itemInOrder" i ON i."orderId"=o."id"
      WHERE o."id" IN (${placeholders})
        AND o."status"<>'cancel'
        AND i."status"<>'cancel'
    )
    SELECT v.*,
           cu."email" as "clientEmail",
           cu."name"  as "clientName",
           s."staffId",
           stf."email" as "staffEmail",
           stf."name"  as "staffName"
    FROM valid v
    JOIN "account" cu ON cu."id"=v."clientId"
    JOIN "slot" s ON s."id"=v."slotId"
    LEFT JOIN "account" stf ON stf."id"=s."staffId"
  `;
  const res = await client.query(sql, orderIds);
  if (!res.rowCount) {
    // no active items => maybe already canceled
    return { ok:false, error:"It looks like the order is empty(need inspection) or was inturupted cancel during processing." };
  }

  // 2) Build user refund map, order->(client, staff) for tasks
  const refundMap = new Map();  // userId -> sumPoints
  const orderInfoMap = new Map(); // orderId -> { userEmail, staffEmail, etc. }

  for (let row of res.rows) {
    const {
      orderId,
      clientId,
      itemPoint,
      refunded,
      clientEmail,
      clientName,
      staffId,
      staffEmail,
      staffName
    } = row;
  
    if (!refunded) {
      const prev = refundMap.get(clientId) ?? 0;
      refundMap.set(clientId, prev + Number(itemPoint || 0));
    }
    if (!orderInfoMap.has(orderId)) {
      orderInfoMap.set(orderId, {
        clientId,
        clientEmail,
        clientName,
        staffId,
        staffEmail,
        staffName
      });
    }
  }
  

  // 3) itemInOrder => canceled+refunded
  const updItemSql = `
    UPDATE "itemInOrder" i
    SET "status"='cancel', "refunded"=true
    FROM "order" o
    WHERE o."id"=i."orderId"
      AND o."id" IN (${placeholders})
      AND o."status"<>'cancel'
      AND i."status"<>'cancel'
  `;
  await client.query(updItemSql, orderIds);

  if (refundMap.size > 0) {
    // Build arrays
    const valueRows = [];
    for (const [uId, sumPts] of refundMap.entries()) {
      valueRows.push({ userId: uId, points: sumPts });
    }
    // Example approach: we do a big “UPDATE account a
    // FROM (VALUES (userId, points),...) AS tmp(userId, sumPts)
    // WHERE a.id=tmp.userId AND a.role='user'
    const vals = [];
    const lines = valueRows.map((obj, i) => {
      const base = i * 2;
      vals.push(obj.userId, obj.points);
      return `($${base + 1}::varchar(20), $${base + 2}::numeric)`;
    }).join(',');
    //($1::varchar(20), $2::numeric),($3::varchar(20), $4::numeric)

    const refundSql = `
      UPDATE "account" a
      SET "point"=COALESCE(a."point",0) + tmp."sumPts"
      FROM ( VALUES ${lines} ) AS tmp("userId","sumPts")
      WHERE a."id"=tmp."userId"
        AND a."role"='user'
    `;
    await client.query(refundSql, vals);
  }

    // Step D) Mark order => canceled
    const updOrd = `
    UPDATE "order"
    SET "status"='cancel'
    WHERE "id" IN(${placeholders})
      AND "status"<>'cancel'
  `;
  await client.query(updOrd, orderIds);

 // 6) remove from unavailableItem => each slot + neighbors
  //   We’ll do a small additional query for slot+item if needed...
  //   Or we can do a triple approach. For brevity, skip details here or do your tripleSet approach.

  // (omitted in example for length; you’d do getNeighborSlotMap, produce a big “VALUES(...)”,
  //  do a single DELETE FROM “unavailableItem” USING(VALUES...).
  //  exactly as you showed above.)
  //Thia is old code that might work or not just see the old

  const slotItemsMap = new Map(); // slotId => Set(itemId)
  for (let row of res.rows) {
    const { slotId, itemId } = row;
    if (!slotItemsMap.has(slotId)) {
      slotItemsMap.set(slotId, new Set());
    }
    slotItemsMap.get(slotId).add(itemId);
  }

  // 2) fetch neighbor slots
  const allSlotIds = [...slotItemsMap.keys()];
  const neighborMap = await getNeighborSlotMap(allSlotIds, client);

  // 3) build the tripleSet
  const tripleSet = [];
  for (let [slotId, itemSet] of slotItemsMap.entries()) {
    const neighbors = neighborMap.get(slotId) || [];
    const allSlots = [slotId, ...neighbors];
    for (let it of itemSet) {
      // for each neighborSlot => push triple
      for (let sl of allSlots) {
        tripleSet.push({ slotId: sl, itemId: it, sourceSlotId: slotId });
      }
    }
  }
  console.log(tripleSet);

  if (tripleSet.length > 0) {
    // single "DELETE ... USING (VALUES(...))"
    const allVals = [];
    const lines = tripleSet.map((obj, i)=>{
      const base = i*3;
      allVals.push(obj.slotId, obj.itemId, obj.sourceSlotId);
      return `($${base+1}::int,$${base+2}::int,$${base+3}::int)`;
    }).join(',');
    console.log(allVals);
    const delSql = `
      DELETE FROM "unavailableItem"
      USING ( VALUES ${lines} ) AS T("slotId","itemId","sourceSlotId")
      WHERE "unavailableItem"."slotId"= T."slotId"
        AND "unavailableItem"."itemId"= T."itemId"
        AND "unavailableItem"."sourceSlotId"= T."sourceSlotId"
    `;
    await client.query(delSql, allVals);
  }


  // 7) tasks => we do 2 tasks per order: user + staff
  const tasks = [];
  for (let [orderId, info] of orderInfoMap.entries()) {
    // user
    if (info.clientEmail) {
      tasks.push({
        type: 'email',
        status: 'pending',
        emailCase: 'order_cancel_user',
        recipientEmail: info.clientEmail,
        variables: {
          userName: info.clientName,
          orderId,
          reason
        }
      });
    }
    // staff
    if (info.staffEmail) {
      tasks.push({
        type: 'email',
        status: 'pending',
        emailCase: 'order_cancel_staff',
        recipientEmail: info.staffEmail,
        variables: {
          staffName: info.staffName,
          orderId,
          reason
        }
      });
    }
  }
  if (tasks.length > 0) {
    const vals = [];
    const place = tasks.map((t, i) => {
      const base = i * 5;
      vals.push(t.type, t.status, t.emailCase, t.recipientEmail, JSON.stringify(t.variables));
      return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`;
    }).join(',');
    const ins = `
      INSERT INTO tasks("type","status","emailCase","recipientEmail","variables")
      VALUES ${place}
    `;
    await client.query(ins, vals);
  }

  return { ok: true, canceledOrders: orderIds };
} catch (err) {
    console.error("Error in doCancelOrders:", err);
    return { ok:false, error: err.message };
  }
}

/**
 * doCancelSlots
 *
 * Cancels the given slots (sets slot.status='cancel'), removes neighborSlot entries,
 * finds & cancels any active orders in those slots, refunds users, removes from
 * unavailableItem (and neighbor slots), and queues staff/user emails.
 *
 * NOTE: No staffEmail/staffName in the arguments—everything is fetched from DB.
 *
 * @param {object} client - DB client
 * @param {number[]} slotIds - Array of slot IDs to cancel
 * @param {string} [reason='Slot forcibly canceled'] - Reason for cancellation
 *
 * @returns {Promise<{ok:boolean, error?:string, canceledSlots?:number[], canceledOrders?:number[]}>}
 */
export async function doCancelSlots(
  client,
  slotIds,
  reason = 'Slot forcibly canceled',
) {
  try {
  if (!slotIds || !slotIds.length) {
    return { ok:false, error: "No slotIds provided" };
  }
      // 2) Build a single big CTE statement to:
    //    - cancel the slots + return them (canceledSlots)
    //    - remove neighborSlot entries referencing those slots (neighborDel)
    //    - collect staff data for those canceled slots (canceledStaff)
    //    - find active orders in those slots (ordersInSlots)
    //    - join itemInOrder + user + staff (validRows)
    //
    // We'll do a final SELECT from validRows, plus sub-selects for canceledSlots & canceledStaff as JSON arrays.

  // 1) Mark all these slots => 'cancel' in one go
  const sql = `
  WITH "canceledSlots" AS (
    UPDATE "slot"
    SET "status"='cancel'
    WHERE "status" = ANY($1)
      AND "id" = ANY($2)
    RETURNING "id", "staffId"
  ),
  "canceledStaff" AS (
    SELECT cs."id" as "slotId",
           cs."staffId",
           stf."email" as "staffEmail",
           stf."name"  as "staffName"
    FROM "canceledSlots" cs
    LEFT JOIN "account" stf ON stf."id" = cs."staffId"
  ),
  "ordersInSlots" AS (
    SELECT o."id" as "orderId",
           o."clientId",
           o."slotId"
    FROM "order" o
    JOIN "canceledSlots" cs ON cs."id" = o."slotId"
    WHERE o."status" NOT IN('cancel','complete')
  ),
  "validRows" AS (
    SELECT ois."orderId",
           ois."clientId",
           ois."slotId",
           i."itemId",
           i."point" as "itemPoint",
           i."refunded"
    FROM "ordersInSlots" ois
    JOIN "itemInOrder" i ON i."orderId" = ois."orderId"
    WHERE i."status" <> 'cancel'
  )
  SELECT
    -- Cancelled slot IDs as an array
    (SELECT COALESCE(json_agg(cs2."id"), '[]'::json)
     FROM "canceledSlots" cs2) AS "canceledSlotIds",

    -- Also an array of (slotId, staffId, staffEmail, staffName)
    (SELECT COALESCE(json_agg(json_build_object(
       'slotId', cst."slotId",
       'staffId', cst."staffId",
       'staffEmail', cst."staffEmail",
       'staffName', cst."staffName"
     )), '[]'::json)
     FROM "canceledStaff" cst
    ) AS "canceledStaff",

    -- Now the actual data from validRows (if any) for each slot
    cs."id" as "canceledSlotId",               -- slot ID from canceledSlots
    cs."staffId" as "slotStaffId",            -- might be redundant
    v."orderId",
    v."clientId",
    v."itemId",
    v."itemPoint",
    v."refunded",

    -- We'll fetch the user email & name if we have an order
    cu."email" as "clientEmail",
    cu."name"  as "clientName",

    -- We'll fetch the staff from the slot if it still references them
    stf."email" as "slotStaffEmail",
    stf."name"  as "slotStaffName"

  FROM "canceledSlots" cs
    -- left join validRows => ensures we get a row for the slot even if no validRows
    LEFT JOIN "validRows" v ON v."slotId" = cs."id"
    -- For the user fields:
    LEFT JOIN "account" cu ON cu."id" = v."clientId"
    -- For the staff fields:
    LEFT JOIN "account" stf ON stf."id" = cs."staffId"
`;
const allowedStatuses = ['open', 'hidden'];
const params = [allowedStatuses, slotIds];
const queryRes = await client.query(sql, params);

// If no rows => either no slot got canceled or no matching statuses
if (!queryRes.rowCount) {
  return {
    ok: false,
    error: 'No slots were canceled or no active items found (rowCount=0).'
  };
}

// We'll parse all rows. The first row has the JSON arrays
let canceledSlotIds = [];
let canceledStaffArr = [];
if (queryRes.rows[0].canceledSlotIds) {
  canceledSlotIds = queryRes.rows[0].canceledSlotIds;
}
if (queryRes.rows[0].canceledStaff) {
  canceledStaffArr = queryRes.rows[0].canceledStaff;
}

// If no canceled slots => short-circuit
if (!canceledSlotIds.length) {
  return {
    ok: false,
    error: 'No slots were successfully canceled—maybe already canceled?'
  };
}

let orderRows = [];
for (const row of queryRes.rows) {
  if (row.orderId) {
    orderRows.push({
      orderId: row.orderId,
      slotId: row.canceledSlotId,
      clientId: row.clientId,
      itemId: row.itemId,
      itemPoint: row.itemPoint,
      refunded: row.refunded,
      clientEmail: row.clientEmail,
      clientName: row.clientName,
      slotStaffEmail: row.slotStaffEmail,
      slotStaffName: row.slotStaffName
    });
  }
}

await queueSlotCancelStaffEmails(client, canceledStaffArr, reason, []);
// If NO orders => all canceled slots have zero orders
if (!orderRows.length) {
  // Possibly send “slot_cancel_staff” emails to each staff in canceledStaffArr
  await client.query(`
    DELETE FROM "neighborSlot"
    WHERE "slotMin" = ANY($1)
       OR "slotMax" = ANY($1)
  `, [canceledSlotIds]);
  // Then return
  return { ok: true, canceledSlots: canceledSlotIds, canceledOrders: [] };
}
    const uniqueOrderIds = new Set(orderRows.map(r => r.orderId));
    const refundMap = new Map();  // userId => sumPoints
    const orderInfoMap = new Map(); // orderId => { user/staff data }

    for (const r of orderRows) {
      if (!r.refunded) {
        const prev = refundMap.get(r.clientId) || 0;
        refundMap.set(r.clientId, prev + Number(r.itemPoint || 0));
      }
      if (!orderInfoMap.has(r.orderId)) {
        orderInfoMap.set(r.orderId, {
          clientEmail: r.clientEmail,
          clientName: r.clientName
        });
      }
    }

    const orderIdsArray = [...uniqueOrderIds];
    const placeholders = orderIdsArray.map((_, i) => `$${i + 1}`).join(',');
    const updItemSql = `
      UPDATE "itemInOrder" i
      SET "status"='cancel', "refunded"=true
      FROM "order" o
      WHERE o."id" = i."orderId"
        AND o."id" IN (${placeholders})
        AND o."status"<>'cancel'
        AND i."status"<>'cancel'
    `;
    await client.query(updItemSql, orderIdsArray);


    if (refundMap.size) {
      const vals = [];
      const lines = [...refundMap.entries()].map(([uId, pts], i) => {
        const base = i * 2;
        vals.push(pts, uId);
        return `($${base + 1}::numeric, $${base + 2}::varchar(20))`;
      }).join(',');

      const refundSql = `
        UPDATE "account" a
        SET "point" = COALESCE(a."point", 0) + r."sumPts"
        FROM (VALUES ${lines}) AS r("sumPts","userId")
        WHERE a."id" = r."userId"
          AND a."role"='user'
      `;
      await client.query(refundSql, vals);
    }

    const updOrderSql = `
    UPDATE "order"
    SET "status"='cancel'
    WHERE "id" IN (${placeholders})
      AND "status"<>'cancel'
  `;
  await client.query(updOrderSql, orderIdsArray);

  const slotItemsMap = new Map(); // slotId => Set(itemId)
  for (const r of orderRows) {
    if (!slotItemsMap.has(r.slotId)) {
      slotItemsMap.set(r.slotId, new Set());
    }
    slotItemsMap.get(r.slotId).add(r.itemId);
  }
  const allSlotIds = [...slotItemsMap.keys()];
  const neighborMap = await getNeighborSlotMap(allSlotIds, client);
  const tripleSet = [];
  for (let [slotId, itemSet] of slotItemsMap.entries()) {
    const neighbors = neighborMap.get(slotId) || [];
    const allSlots = [slotId, ...neighbors];
    for (const it of itemSet) {
      for (const sl of allSlots) {
        tripleSet.push({ slotId: sl, itemId: it, sourceSlotId: slotId });
      }
    }
  }

  // single DELETE
  if (tripleSet.length > 0) {
    const allVals = [];
    const lines = tripleSet.map((obj, i) => {
      const base = i * 3;
      allVals.push(obj.slotId, obj.itemId, obj.sourceSlotId);
      return `($${base+1}::int,$${base+2}::int,$${base+3}::int)`;
    }).join(',');

    const delSql = `
      DELETE FROM "unavailableItem"
      USING ( VALUES ${lines} ) AS T("slotId","itemId","sourceSlotId")
      WHERE "unavailableItem"."slotId"= T."slotId"
        AND "unavailableItem"."itemId"= T."itemId"
        AND "unavailableItem"."sourceSlotId"= T."sourceSlotId"
    `;
    await client.query(delSql, allVals);
  }

  let tasks = [];
  for (const [orderId, info] of orderInfoMap.entries()) {
    // user
    if (info.clientEmail) {
      tasks.push({
        type: 'email',
        status: 'pending',
        emailCase: 'order_cancel_user',
        recipientEmail: info.clientEmail,
        variables: {
          userName: info.clientName,
          orderId,
          reason
        }
      });
    }
  }

  if (tasks.length) {
    await insertTasks(client, tasks);
  }

  await client.query(`
    DELETE FROM "neighborSlot"
    WHERE "slotMin" = ANY($1)
       OR "slotMax" = ANY($1)
  `, [canceledSlotIds]);

  return {
    ok: true,
    canceledSlots: canceledSlotIds,
    canceledOrders: orderIdsArray
  };
} catch (err) {
  console.error('Error in doCancelSlots:', err);
  return { ok: false, error: err.message };
}
}



/**********************************************************
 * insertTasks: helper for mass insert
 **********************************************************/
async function insertTasks(client, tasks) {
  if (!tasks?.length) return;
  const vals = [];
  const place = tasks.map((t, i) => {
    const base = i * 5;
    vals.push(t.type, t.status, t.emailCase, t.recipientEmail, JSON.stringify(t.variables || {}));
    return `($${base+1},$${base+2},$${base+3},$${base+4},$${base+5})`;
  }).join(',');
  const sql = `
    INSERT INTO tasks("type","status","emailCase","recipientEmail","variables")
    VALUES ${place}
  `;
  await client.query(sql, vals);
}

/**
 * queueSlotCancelStaffEmails
 *  If you need a helper function for the “no orders” case,
 *  we used it above. But in the code above, we simply inline the logic.
 */
async function queueSlotCancelStaffEmails(client, canceledStaffArr, reason, canceledOrders) {
  if (!canceledStaffArr || !canceledStaffArr.length) return;
  const tasks = [];
  for (const cst of canceledStaffArr) {
    if (!cst.staffEmail) continue;
    tasks.push({
      type: 'email',
      status: 'pending',
      emailCase: 'slot_cancel_staff',
      recipientEmail: cst.staffEmail,
      variables: {
        staffName: cst.staffName,
        slotId: cst.slotId,
        reason,
      }
    });
  } 
  if (tasks.length) {
    await insertTasks(client, tasks);
  }
}

function groupSlotOrders(arr) {
  // Group objects by slotId
  const grouped = new Map();
  for (const { slotId, orderId } of arr) {
    if (!grouped.has(slotId)) {
      grouped.set(slotId, []);
    }
    grouped.get(slotId).push(orderId);
  }

  // Convert each group to the string "slotId:orderId1,orderId2, ..."
  const result = [];
  for (const [slotId, orderIds] of grouped.entries()) {
    result.push(`${slotId}:${orderIds.join(',')}`);
  }
  return result;
}