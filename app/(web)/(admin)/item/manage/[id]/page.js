// app/(web)/(admin)/item/manage/[id]/page.js
import { dbQuery } from "@/lib/db.js";
import ManageItemWrapper from "./ManageItemWrapper.jsx";
import { Suspense } from "react";

export const experimental_ppr = true;

export default async function ManageItemPage({ params }) {
  const itemId = (await params).id;

  // Query the "item" table for the item record.
  // Using double quotes to match your case-sensitive Postgres usage.
  const itemSql = `
    SELECT
      i."id",
      i."name",
      i."typeId",
      i."describe",
      i."point",
      i."status"
    FROM "item" i
    WHERE i."id" = $1
      AND i."status" <> 'deleted'
  `;
  const itemRes = await dbQuery(itemSql, [itemId]);
  if (itemRes.rowCount < 1) {
    return <NotFoundView />;
  }
  const item = itemRes.rows[0];

  // Query associated images from "itemImage"
  // "order" is reserved, so we definitely keep it in quotes.
  const imgSql = `
    SELECT "path", "order"
    FROM "itemImage"
    WHERE "itemId" = $1
    ORDER BY "order" ASC
  `;
  const imgRes = await dbQuery(imgSql, [itemId]);
  item.images = imgRes.rows;

  return (
    <div style={{ padding: "1rem" }}>
      <Suspense fallback={<div>Loading Manage Item...</div>}>
        <ManageItemWrapper item={item} />
      </Suspense>
    </div>
  );
}

function NotFoundView() {
  return (
    <div style={{ padding: "1rem", color: "red" }}>
      <h3>Item not found or has been deleted.</h3>
    </div>
  );
}
