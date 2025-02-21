// app/(web)/(admin)/item/actions.js
"use server";

import { pool } from "@/lib/db.js";
import { z } from "zod";
import { validateAndSanitize } from "@/modules/sanitizeService.js";
import fs from "fs/promises";
import path from "path";

const ManageItemSchema = z.object({
  action: z.enum(["create", "update", "toggleHide", "maintenance", "delete"]),
  itemId: z.coerce.number().positive().optional(),
  name: z.string().min(1).max(127).optional(),
  describe: z.string().max(10000).optional(),
  point: z.coerce.number().int().gt(0).optional(),
  typeId: z.coerce.number().int().gt(0).optional(),
  confirmCancel: z.coerce.boolean().optional().default(false),
  imageOrder: z.array(z.string()).optional(),
  removedImages: z.array(z.string()).optional(),
});

export async function manageItemAction(payload, externalClient = null) {
  let client = externalClient;
  let createdLocalClient = false;
  if (!client) {
    client = await pool.connect();
    createdLocalClient = true;
    await client.query("BEGIN");
  }
  try {
    const { valid, data, errors } = validateAndSanitize(payload, ManageItemSchema);
    if (!valid) {
      if (createdLocalClient) await client.query("ROLLBACK");
      return { ok: false, fieldErrors: errors };
    }
    let result;
    switch (data.action) {
      case "create":
        result = await handleCreate(client, data);
        break;
      case "update":
        result = await handleUpdate(client, data);
        break;
      case "toggleHide":
        result = await handleToggleHide(client, data);
        break;
      case "maintenance":
        result = await handleMaintenance(client, data);
        break;
      case "delete":
        result = await handleDeleteItem(client, data);
        break;
      default:
        result = { ok: false, error: "Unknown action" };
    }
    if (!result.ok) {
      if (createdLocalClient) await client.query("ROLLBACK");
      return result;
    }
    const finalCheck = await finalConcurrencyCheck(client, data);
    if (!finalCheck.ok) {
      if (createdLocalClient) await client.query("ROLLBACK");
      return finalCheck;
    }
    if (createdLocalClient) await client.query("COMMIT");
    return result;
  } catch (err) {
    if (createdLocalClient) await client.query("ROLLBACK");
    return { ok: false, error: err.message };
  } finally {
    if (createdLocalClient && client) client.release();
  }
}

export async function searchActiveItems(filterBy, searchQuery, page) {
  const db = pool;
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  let whereClause = `WHERE "status" <> 'deleted'`;
  const params = [];

  if (searchQuery) {
    if (filterBy === "id") {
      whereClause += ` AND CAST("id" as TEXT) ILIKE $${params.length + 1}`;
      params.push(`%${searchQuery}%`);
    } else if (filterBy === "name") {
      whereClause += ` AND "name" ILIKE $${params.length + 1}`;
      params.push(`%${searchQuery}%`);
    } else if (filterBy === "typeId") {
      // cast typeId as text for ILIKE
      whereClause += ` AND CAST("typeId" as TEXT) ILIKE $${params.length + 1}`;
      params.push(`%${searchQuery}%`);
    }
  }

  const countSql = `
    SELECT COUNT(*) as total
    FROM "item"
    ${whereClause}
  `;
  const countRes = await db.query(countSql, params);
  const totalCount = parseInt(countRes.rows[0].total, 10);

  const itemSql = `
    SELECT "id", "name", "typeId", "point", "status"
    FROM "item"
    ${whereClause}
    ORDER BY "id"
    LIMIT ${pageSize} OFFSET ${offset}
  `;
  const itemRes = await db.query(itemSql, params);

  return {
    page,
    totalCount,
    items: itemRes.rows,
  };
}

export async function createItemAction(formData) {
  const db = pool;
  const name = formData.get("name")?.toString() || "";
  const typeIdStr = formData.get("typeId")?.toString() || "0";
  const typeId = parseInt(typeIdStr, 10);

  const pointStr = formData.get("point")?.toString() || "0";
  const point = parseInt(pointStr, 10);

  const insertSql = `
    INSERT INTO "item"("name","typeId","point","status")
    VALUES ($1,$2,$3,'show')
    RETURNING "id"
  `;
  const values = [name, typeId, point];
  const res = await db.query(insertSql, values);
  const newId = res.rows[0].id;

  // Return so the client can do router.push
  return { ok: true, newId };
}

async function handleCreate(client, data) {
  const insertSql = `
    INSERT INTO "item"("name","typeId","point","status")
    VALUES ($1,$2,$3,'show')
    RETURNING "id"
  `;
  const vals = [data.name, data.typeId, data.point];
  const res = await client.query(insertSql, vals);
  const newId = res.rows[0].id;
  return { ok: true, newId };
}

async function handleUpdate(client, data) {
  if (!data.itemId) {
    return { ok: false, error: "Item ID is required for update" };
  }
  const updateSql = `
    UPDATE "item"
    SET
      "name" = COALESCE($2, "name"),
      "describe" = COALESCE($3, "describe"),
      "point" = COALESCE($4, "point"),
      "typeId" = COALESCE($5, "typeId")
    WHERE "id" = $1
      AND "status" <> 'deleted'
  `;
  const values = [
    data.itemId,
    data.name || null,
    data.describe || null,
    data.point || null,
    data.typeId || null,
  ];
  await client.query(updateSql, values);

  if (data.imageOrder && Array.isArray(data.imageOrder)) {
    for (let i = 0; i < data.imageOrder.length; i++) {
      const imagePath = data.imageOrder[i];
      const orderValue = i + 1;
      const updImageSql = `
        UPDATE "itemImage"
        SET "order" = $1
        WHERE "itemId" = $2
          AND "path" = $3
      `;
      await client.query(updImageSql, [orderValue, data.itemId, imagePath]);
    }
  }
  if (data.removedImages && Array.isArray(data.removedImages)) {
    for (const imagePath of data.removedImages) {
      const delImageSql = `
        DELETE FROM "itemImage"
        WHERE "itemId" = $1
          AND "path" = $2
      `;
      await client.query(delImageSql, [data.itemId, imagePath]);
      try {
        const filePath = path.join(process.cwd(), "public", imagePath);
        await fs.unlink(filePath);
      } catch (err) {
        console.error("Failed to delete image file:", err);
      }
    }
  }
  return { ok: true };
}

async function handleToggleHide(client, data) {
  if (!data.itemId) {
    return { ok: false, error: "Item ID is required for toggleHide" };
  }
  const res = await client.query(`SELECT "status" FROM "item" WHERE "id"=$1`, [data.itemId]);
  if (res.rowCount < 1) {
    return { ok: false, error: "Item not found" };
  }
  const currentStatus = res.rows[0].status;
  let newStatus;
  if (currentStatus === "show") {
    newStatus = "hide";
  } else if (currentStatus === "hide") {
    newStatus = "show";
  } else {
    return { ok: false, error: "Cannot toggle status for this item" };
  }
  await client.query(`UPDATE "item" SET "status"=$1 WHERE "id"=$2`, [newStatus, data.itemId]);
  return { ok: true, newStatus };
}

async function handleMaintenance(client, data) {
  if (!data.itemId) {
    return { ok: false, error: "Item ID is required for maintenance" };
  }
  const activeOrders = await dummyCheckOrdersForItem(client, data.itemId);
  if (activeOrders.inHand.length > 0) {
    return {
      ok: false,
      concurrency: true,
      inHand: activeOrders.inHand,
      pending: activeOrders.pending,
      requiredAction: "CANNOT_SET_MAINTENANCE_INHAND",
    };
  }
  if (activeOrders.pending.length > 0 && !data.confirmCancel) {
    return {
      ok: false,
      concurrency: true,
      pending: activeOrders.pending,
      requiredAction: "MAINTENANCE",
    };
  }
  if (activeOrders.pending.length > 0) {
    const cancelRes = await doPartialCancelForItem(client, data.itemId, "Maintenance cancellation");
    if (!cancelRes.ok) return cancelRes;
  }
  await client.query(`UPDATE "item" SET "status"='hide' WHERE "id"=$1`, [data.itemId]);
  return { ok: true };
}

async function handleDeleteItem(client, data) {
  if (!data.itemId) {
    return { ok: false, error: "Item ID is required for delete" };
  }
  const activeOrders = await dummyCheckOrdersForItem(client, data.itemId);
  if (activeOrders.inHand.length > 0) {
    return {
      ok: false,
      concurrency: true,
      inHand: activeOrders.inHand,
      pending: activeOrders.pending,
      requiredAction: "CANNOT_DELETE_INHAND",
    };
  }
  if (activeOrders.pending.length > 0 && !data.confirmCancel) {
    return {
      ok: false,
      concurrency: true,
      pending: activeOrders.pending,
      requiredAction: "DELETE_ITEM",
    };
  }
  if (activeOrders.pending.length > 0) {
    const cancelRes = await doPartialCancelForItem(client, data.itemId, "Deletion cancellation");
    if (!cancelRes.ok) return cancelRes;
  }
  await client.query(`UPDATE "item" SET "status"='deleted' WHERE "id"=$1`, [data.itemId]);
  const imgRes = await client.query(`SELECT "path" FROM "itemImage" WHERE "itemId"=$1`, [
    data.itemId,
  ]);
  const imagePaths = imgRes.rows.map((r) => r.path);
  await client.query(`DELETE FROM "itemImage" WHERE "itemId"=$1`, [data.itemId]);
  for (const imgPath of imagePaths) {
    try {
      const filePath = path.join(process.cwd(), "public", imgPath);
      await fs.unlink(filePath);
    } catch (err) {
      console.error("Failed to delete image file during deletion:", err);
    }
  }
  return { ok: true, fullyDeleted: true };
}

async function dummyCheckOrdersForItem(client, itemId) {
  const blockStatuses = ["inHand", "lateForReturn"];
  const cancelStatuses = ["pending", "waitForDelivery", "lateForDelivery"];
  const statuses = blockStatuses.concat(cancelStatuses);
  const sql = `
    SELECT o."id", o."status"
    FROM "order" o
    JOIN "itemInOrder" iio ON o."id" = iio."orderId"
    WHERE iio."itemId" = $1
      AND o."status" = ANY($2)
  `;
  const res = await client.query(sql, [itemId, statuses]);
  const inHand = [];
  const pending = [];
  for (const row of res.rows) {
    if (blockStatuses.includes(row.status)) {
      inHand.push(row.id);
    } else if (cancelStatuses.includes(row.status)) {
      pending.push(row.id);
    }
  }
  return { inHand, pending };
}

async function doPartialCancelForItem(client, itemId, reason) {
  const activeOrders = await dummyCheckOrdersForItem(client, itemId);
  if (activeOrders.pending.length === 0) {
    return { ok: true };
  }
  const placeholders = activeOrders.pending.map((_, i) => `$${i + 1}`).join(",");
  const updItemSql = `
    UPDATE "itemInOrder"
    SET "status"='cancel', "refunded"=true
    WHERE "orderId" IN (${placeholders})
      AND "itemId" = $${activeOrders.pending.length + 1}
      AND "status" <> 'cancel'
  `;
  const params = [...activeOrders.pending, itemId];
  await client.query(updItemSql, params);

  // Refund logic
  const itemRes = await client.query(`SELECT "point" FROM "item" WHERE "id"=$1`, [itemId]);
  if (itemRes.rowCount === 0) {
    return { ok: false, error: "Item not found during cancellation" };
  }
  const itemPoint = itemRes.rows[0].point;

  const ordersRes = await client.query(
    `
    SELECT o."id", o."clientId"
    FROM "order" o
    JOIN "itemInOrder" iio ON o."id" = iio."orderId"
    WHERE iio."itemId" = $1
      AND o."id" = ANY($2)
  `,
    [itemId, activeOrders.pending]
  );
  for (const order of ordersRes.rows) {
    await client.query(
      `
      UPDATE "account"
      SET "point" = COALESCE("point", 0) + $1
      WHERE "id" = $2
    `,
      [itemPoint, order.clientId]
    );
  }

  // If no other normal items, cancel entire order
  for (const order of ordersRes.rows) {
    const normalRes = await client.query(
      `
      SELECT COUNT(*) as cnt
      FROM "itemInOrder"
      WHERE "orderId" = $1
        AND "status" <> 'cancel'
    `,
      [order.id]
    );
    if (parseInt(normalRes.rows[0].cnt, 10) === 0) {
      await client.query(`UPDATE "order" SET "status"='cancel' WHERE "id"=$1`, [order.id]);
    }
  }
  return { ok: true };
}

async function finalConcurrencyCheck(client, data) {
  if (data.itemId) {
    const res = await client.query(`SELECT "status" FROM "item" WHERE "id"=$1`, [data.itemId]);
    if (res.rowCount < 1) {
      return { ok: false, error: "Item not found in final check" };
    }
    const status = res.rows[0].status;
    if (status === "deleted") {
      return { ok: false, error: "Item is already deleted" };
    }
  }
  return { ok: true };
}
