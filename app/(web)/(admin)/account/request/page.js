// app/(web)/(admin)/account/request/page.jsx
import { Suspense } from 'react';
import TableShell from '@/ui/TableShell';
import RequestTableClient from '@/ui/(admin)/account/request/RequestTableClient.jsx';
import RequestInfoClient from '@/ui/(admin)/account/request/RequestInfoClient.jsx';

export const experimental_ppr = true;
export const dynamic = 'force-dynamic';

export default function RequestLandingPage() {
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Pending Accounts</h2>

      {/* 
        We'll render a table with columns: ID, Name, Email, Action
        We can do partial prerendering
      */}
      <TableShell columns={['ID','Name','Email','Action']}>
        <Suspense fallback={
          <tr><td colSpan={4}>Loading pending accounts...</td></tr>
        }>
          <RequestTableClient />
        </Suspense>
      </TableShell>

      {/* If you want pagination info, total count, etc.: */}
      <Suspense fallback={<div>Loading pagination...</div>}>
        <RequestInfoClient />
      </Suspense>
    </div>
  );
}
