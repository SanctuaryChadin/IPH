// ui/(admin)/account/TableRowsClient.jsx
'use client';

export const dynamic = 'force-dynamic';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchActiveAccounts } from '@/app/(web)/(admin)/account/actions.js';
import AccountSlot from './AccountSlot';

export default function TableRowsClient() {
  // Read search params from URL:
  const searchParams = useSearchParams();
  
  const searchQuery = (searchParams.get('searchQuery') || '').toLowerCase().trim();
  const filterBy = ((searchQuery === '')?'id' : (searchParams.get('filterBy')  || 'id')).trim();
  const page = parseInt(searchParams.get('page') || '1', 10);

  // Use React Query w/ 'searchAccountsAction' as our queryFn
  // The new Next.js 15 syntax allows direct usage of server actions
  // as async functions in the client. 

  const { data  } = useQuery({
    queryKey: ['accounts', filterBy, searchQuery, page],
    queryFn: () => searchActiveAccounts(filterBy, searchQuery, page),
    staleTime: 30_000,  // 30s
    cacheTime: 30_000,  // 30s
    suspense: true,
  });

  if (data.error) {
    // let the calling Suspense boundary show an error boundary if you want
    // or just return some inline error
    return (
      <tr>
        <td colSpan={5} style={{ color: 'red' }}>
          {data.error}
        </td>
      </tr>
    );
  }

  if (!data.accounts || data.accounts.length === 0) {
    return (
      <tr>
        <td colSpan={5}>No matching accounts found.</td>
      </tr>
    );
  }

  return (
    <>
      {data.accounts.map((acc) => (
        <AccountSlot key={acc.id} acc={acc} />
      ))}
    </>
  );
}