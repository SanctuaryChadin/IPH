// app/(web)/(admin)/account/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import SearchBar from '@/ui/SearchBar.jsx';
import TableRowsClient from '@/ui/(admin)/account/TableRowsClient.jsx';
import TableInfoClient from '@/ui/(admin)/account/TableInfoClient.jsx';
import TableShell from '@/ui/TableShell.jsx';

export const experimental_ppr = true;


export default function AccountLandingPage() {
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Account Landing</h2>

      <p>
        <Link href="/account/create">+ Create Account</Link>
      </p>

      <SearchBar
        placeholder="Search accounts..."
        filterOptions={{ id: 'ID', name: 'Name', role: 'Role' }}
        tanstackQueryKey="accounts"
      />

      {/* 
        Put the <table> layout here (or keep it 
        in TableShell if you like). Then only the 
        <tbody> is Suspense-wrapped with the client data. 
      */}
      <TableShell columns={['ID', 'Name', 'Year # Dept', 'Role', 'Action']}>
        {/* The rows themselves are a client component with Suspense */}
        <Suspense fallback={    <tr>
      <td colSpan="5">Loading rows…</td>
    </tr>}>
          <TableRowsClient />
        </Suspense>
      </TableShell>

      {/* 
        Another client component for total count + pagination 
        using the same query key. 
      */}
      <Suspense fallback={<div>Loading pagination…</div>}>
        <TableInfoClient />
      </Suspense>
    </div>
  );
}
