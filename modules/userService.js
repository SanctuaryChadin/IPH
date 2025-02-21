// modules/userService.js

import { pool } from '../lib/db.js';


/**
 * getValidUserOrFail(email)
 *   - We keep your existing logic. If user not found, banned, pending, or invalid role => throw error.
 */
export async function getValidUserOrFail(email) {
  if (!email) throw new Error('No email provided');

  const sql = `
    SELECT
      a.id         AS account_id,
      a.name       AS account_name,
      a.role       AS account_role,
      b.email      AS ban_email
    FROM ban b
    FULL JOIN account a
      ON a.email = b.email
      AND a.role != 'delete'
    WHERE (b.email = $1 OR a.email = $1)
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(sql, [email]);
    if (rows.length === 0) {
      throw new Error('Not registered');
    }
    const row = rows[0];

    // Is user banned?
    if (row.ban_email) {
      throw new Error('User is banned');
    }
    // Does user have an account row?
    if (!row.account_id) {
      throw new Error('Not registered');
    }
    // Check role
    if (row.account_role === 'pending') {
      throw new Error('Account pending');
    }
    if (!['user', 'courier', 'admin'].includes(row.account_role)) {
      throw new Error('Invalid role');
    }

    return {
      id: row.account_id,
      name: row.account_name,
      role: row.account_role,
    };
  } catch (err) {
    throw new Error(`getValidUserOrFail DB error: ${err.message}`);
  }
}


/**
 * checkIfEmailExists(email)
 *   - If we find a row in `account` table => we throw error based on status:
 *       - banned => "User is banned"
 *       - pending => "Account pending"
 *       - otherwise => "Already have account"
 *   - If no row => return true (meaning "OK to use this email").
 */
export async function checkIfEmailExists(email) {
  if (!email) throw new Error('No email provided');

  const sql = `
    SELECT
      a.id         AS account_id,
      a.name       AS account_name,
      a.role       AS account_role,
      b.email      AS ban_email
    FROM ban b
    FULL JOIN account a
      ON a.email = b.email
      AND a.role != 'delete'
    WHERE (b.email = $1 OR a.email = $1)
    LIMIT 1
  `;

  try {
    const { rows } = await pool.query(sql, [email]);
    if (rows.length === 0) {
      // Not in account or ban => => "true" means "email is free to use"
      return true;
    }
    const row = rows[0];

    // If banned => can't use
    if (row.ban_email) {
      throw new Error('User is banned');
    }
    // If no account row => also free => but let's see if that can happen here:
    if (!row.account_id) {
      return true;
    }
    // We do have an account row. Check role
    if (row.account_role === 'pending') {
      throw new Error('Account pending');
    }
    // Otherwise => "Already have account"
    throw new Error('Already have account');
  } catch (err) {
    throw new Error(`checkIfEmailExists DB error: ${err.message}`);
  }
}


/**
 * createPendingUser(data)
 *   - data should include: 
 *       email, name, phone, line, address, subdistric, distric, province, postCode,
 *       plus `departmentYear` in the format "Department#Year"
 *   - We replicate the unique Account_ID logic (base + optional V2, V3, ...).
 */
export async function createPendingUser(data) {
  if(checkIfEmailExists(data.email)){}
  const deptId = data.department || 13; // fallback to 13=Engineering?
  const yearInt = parseInt(data.year, 10) || 1;

  try {

    // 1) Generate base ID from email
    const base = data.email.slice(0, 10);

    // 2) Find all existing IDs that start with this base
    const fetchSql = `
      SELECT "id"
      FROM account
      WHERE "id" LIKE $1
    `;
    const fetchRes = await pool.query(fetchSql, [base + '%']);
    const existingIds = fetchRes.rows.map((r) => r.id);
    const existingSet = new Set(existingIds);

    // 3) Figure out a suffix
    // Typically we start with suffix=2 if the base alone is taken.
    // Or you could start it = existingIds.length + 1, etc.
    let suffix = 2;
    if (existingIds.length >0){
      suffix = existingIds.length + 1;
    }
    let finalId = base;

    // Keep appending V2, V3, ... until we find a free ID or reach 5000
    while (existingSet.has(finalId) && suffix < 5000) {
      finalId = `${base}V${suffix}`;
      suffix++;
    }
    if (suffix >= 5000) {
      throw new Error("Could not generate unique Account ID. Please contact admin.");
    }
    console.log(deptId);

    // 5) Insert into DB with role='pending'
    const sql = `
      INSERT INTO account
        (id, email, name, "departmentId", year, role, phone, "lineId", address)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING "id"
    `;

    const nameToStore = data.name || ""; // if not provided, store empty

    const combinedAddress = [
      data.address,
      data.subdistric,
      data.distric,
      data.province,
      data.postCode
    ].join(", ");

    const params = [
      finalId,
      data.email,
      data.name,
      deptId,
      yearInt,
      'pending',
      data.phone,
      data.line,
      combinedAddress,
    ];

    const res = await pool.query(sql, params);
    return res.rows[0].id;
  } catch (err) {
    throw new Error(`createPendingUser DB error: ${err.message}`);
  }
}
