// ui/(admin)/account/request/RequestTableClient.jsx
'use client';
export const dynamic = 'force-dynamic';

import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { searchPendingAccounts } from '@/app/(web)/(admin)/account/actions.js'; 
import RequestSlot from './RequestSlot.jsx';

export default function RequestTableClient() {
  // If we do pagination with “page” from the URL:
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const { data } = useQuery({
    queryKey: ['pendingAccounts', page],
    queryFn: () => searchPendingAccounts(page),
    staleTime: 30_000, 
    cacheTime: 30_000,
    suspense: true,
  });

  if (data.error) {
    return (
      <tr><td colSpan={4} style={{ color:'red' }}>{data.error}</td></tr>
    );
  }
  if (!data.pending || data.pending.length === 0) {
    return (
      <tr><td colSpan={4}>No pending accounts found.</td></tr>
    );
  }

  return (
    <>
      {data.pending.map((acc) => (
        <RequestSlot key={acc.id} acc={acc} />
      ))}
    </>
  );
}
