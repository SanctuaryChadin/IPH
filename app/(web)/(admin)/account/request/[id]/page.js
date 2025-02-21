// app/(web)/(admin)/account/request/[id]/page.js

import { dbQuery } from '@/lib/db.js';
import ClientApproveRejectWrapper from '@/ui/(admin)/account/request/[id]/ClientApproveRejectWrapper';
import NotFoundComponent from '@/ui/(admin)/account/request/[id]/NotFoundComponent';

export const experimental_ppr = true;

export default async function ApproveRejectPage({ params }) {
  const accountId = (await params).id; // or (await params).id, depending on your code

  // 1) Fetch the pending account with all fields
  const res = await dbQuery(`
    SELECT
  a."id",
  a."email",
  a."name",
  d."name" AS "departmentName",
  a."year",
  a."phone",
  a."lineId",
  a."address",
  a."note",
  a."createAt"
FROM "account" a
JOIN "department" d
  ON a."departmentId" = d."id"
WHERE a."id" = $1
  AND a."role" = 'pending'`
  , [accountId]);

  if (res.rowCount < 1) {
    // Not found => show Info popup or redirect
    return <NotFoundView />;
  }

  // pass everything to the client wrapper
  let acc = res.rows[0];
  acc.createAt = acc.createAt?.toISOString(); 
  return <ClientApproveRejectWrapper account={acc} />;
}

/** 
 * If not found, show InfoPopup. 
 * We do 'use client' so we can call onClose.
 */
function NotFoundView() {
  return <NotFoundComponent />
}