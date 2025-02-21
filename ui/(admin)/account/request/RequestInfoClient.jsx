// ui/(admin)/account/request/RequestInfoClient.jsx
'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchPendingAccounts } from '@/app/(web)/(admin)/account/actions.js';
import Pagination from '@/ui/Pagination.jsx';

export default function RequestInfoClient() {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data } = useQuery({
    queryKey: ['pendingAccounts', page],
    queryFn: () => searchPendingAccounts(page),
    staleTime: 30_000,
    cacheTime: 30_000,
    suspense: true
  });

  if (data.error) {
    return <p style={{color:'red'}}>{data.error}</p>;
  }
  if (!data.pending) {
    return null;
  }

  return (
    <>
      <p><strong>Total:</strong> {data.totalCount} <br/>
      <strong>Current Page:</strong> {data.page}</p>

      <Pagination
        totalCount={data.totalCount}
        currentPage={data.page}
        filterBy=""  // no filter usage
        searchQuery="" // no search
        pageSize={10}
      />
    </>
  );
}
