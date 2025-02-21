// ui/(admin)/account/ban/BanInfoClient.jsx
'use client';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchBannedEmails } from '@/app/(web)/(admin)/account/actions.js';
import Pagination from '@/ui/Pagination.jsx';

export default function BanInfoClient() {
  const searchParams = useSearchParams();
  const filterBy = (searchParams.get('filterBy') || 'email').trim();
  const searchQuery = (searchParams.get('searchQuery') || '').trim().toLowerCase();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data } = useQuery({
    queryKey: ['bans', filterBy, searchQuery, page],
    queryFn: () => searchBannedEmails(filterBy, searchQuery, page),
    staleTime: 30_000,
    cacheTime: 30_000,
    suspense: true,
  });

  if (data.error) {
    return <p style={{ color: 'red' }}>{data.error}</p>;
  }
  if (!data.bans) {
    return null;
  }

  return (
    <>
      <p>
        <strong>Total Banned:</strong> {data.totalCount} <br />
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
