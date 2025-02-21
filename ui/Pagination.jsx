// ui/Pagination.jsx
'use client';

import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export default function Pagination({
  totalCount,
  currentPage,
  filterBy,
  searchQuery,
  pageSize = 10,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();

  const maxPage = Math.max(1, Math.ceil(totalCount / pageSize));
  if (maxPage <= 1) return null;

  function goToPage(newPage) {
    const params = new URLSearchParams(currentParams.toString());
    params.set('page', String(newPage));

    // preserve filterBy, searchQuery
    if (filterBy) params.set('filterBy', filterBy);
    if (searchQuery) params.set('searchQuery', searchQuery);

    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div style={{ marginTop: '1rem' }}>
      {currentPage > 1 && (
        <button onClick={() => goToPage(currentPage - 1)}>Previous</button>
      )}{' '}
      <span>{`Page ${currentPage} of ${maxPage}`}</span>{' '}
      {currentPage < maxPage && (
        <button onClick={() => goToPage(currentPage + 1)}>Next</button>
      )}
    </div>
  );
}
