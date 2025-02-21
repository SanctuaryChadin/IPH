// ui/(admin)/account/TableInfoClient.jsx
'use client';

export const dynamic = 'force-dynamic';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchActiveAccounts } from '@/app/(web)/(admin)/account/actions.js';
import Pagination from '@/ui/Pagination.jsx';

export default function TableInfoClient() {
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

  // If there's an error or no data, you might handle that similarly:
  if (data.error) {
    return <p style={{ color: 'red' }}>{data.error}</p>;
  }
  if (!data.accounts) {
    return null; // or some fallback
  }

  return (
    <>
      <p>
        <strong>Total:</strong> {data.totalCount} <br />
        <strong>Current Page:</strong> {data.page}
      </p>

      <Pagination
        totalCount={data.totalCount}
        currentPage={data.page}
        filterBy={filterBy}
        searchQuery={searchQuery}
        pageSize={10}
      />
    </>
  );
}
