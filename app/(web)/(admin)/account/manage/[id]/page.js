// app/(web)/(admin)/account/manage/[id]/page.jsx
import { dbQuery } from "@/lib/db";
import ManageClientWrapper from "./ClientManageWrapper.jsx";
import { Suspense } from "react";

export const experimental_ppr = true;

export default async function ManageSingleAccountPage({ params }) {
  const accountId = (await params).id; 
  const sql=`
    SELECT
      a."id",
      a."email",
      a."name",
      a."departmentId",
      a."year",
      a."role",
      a."phone",
      a."lineId",
      a."address",
      a."point",
      a."note",
      a."club"
    FROM "account" a
    WHERE a."id"=$1
      AND a."role"<>'delete'
  `;
  const res = await dbQuery(sql, [accountId]);
  if (res.rowCount < 1) {
    return <NotFoundView />;
  }
  const account = res.rows[0];

  return (
    <div style={{padding:'1rem'}}>
      <h2>Manage Account: {account.id}</h2>
      <Suspense fallback={<div>Loading...</div>}>
        <ManageClientWrapper account={account} />
      </Suspense>
    </div>
  );
}

function NotFoundView() {
  return (
    <div style={{padding:'1rem',color:'red'}}>
      <h3>Account not found or already deleted.</h3>
    </div>
  );
}
