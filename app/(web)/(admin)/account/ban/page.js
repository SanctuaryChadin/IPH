// app/(web)/(admin)/account/ban/page.jsx
import { Suspense } from 'react';
import TableShell from '@/ui/TableShell';
import BanTableClient from '@/ui/(admin)/account/ban/BanTableClient.jsx';
import BanInfoClient from '@/ui/(admin)/account/ban/BanInfoClient.jsx';
import SearchBar from '@/ui/SearchBar';

export const experimental_ppr = true;
export const dynamic = 'force-dynamic';

export default function BanLandingPage() {
  return (
    <div style={{ padding: '1rem' }}>
      <h2>Banned Emails</h2>

      <SearchBar
        placeholder="Search Banned..."
        filterOptions={{ email:'Email', reason:'Reason' }}
        tanstackQueryKey="bans"
      />

      <TableShell columns={['Email', 'Reason', 'Timestamp', 'Action']}>
        <Suspense
          fallback={
            <tr>
              <td colSpan={4}>Loading banned emails...</td>
            </tr>
          }
        >
          <BanTableClient />
        </Suspense>
      </TableShell>

      <Suspense fallback={<div>Loading pagination...</div>}>
        <BanInfoClient />
      </Suspense>
    </div>
  );
}
