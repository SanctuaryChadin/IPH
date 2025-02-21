// ui/SearchBar.jsx
'use client';

import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { useDebouncedCallback } from 'use-debounce';
import { useState, useEffect } from 'react';
import { useIsFetching } from '@tanstack/react-query';

export default function SearchBar({
  placeholder = 'Search...', 
  filterOptions = null,
  tanstackQueryKey
}) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();

  const existingQuery = currentParams.get('searchQuery') || '';

  let existingFilter = '';
  if (filterOptions) {
    // If the URL has 'filterBy' param, use it; otherwise fallback to the first key
    const firstKey = Object.keys(filterOptions)[0] || '';
    existingFilter = currentParams.get('filterBy') || firstKey;
  }
  // Local state
  const [filterBy, setFilterBy] = useState(existingFilter);
  const [term, setTerm] = useState(existingQuery);

  // Keep local states in sync if URL changes outside this component
  useEffect(() => {
    // Always sync the search text
    setTerm(existingQuery);
    // Only sync the filter if filterOptions is present
    if (filterOptions) {
      setFilterBy(existingFilter);
    } else {
      setFilterBy('');  // or do nothing if you prefer
    }
  }, [existingQuery, existingFilter, filterOptions]);

  // Helper function to update the URL
  function updateUrl(newFilter, newTerm) {
    const params = new URLSearchParams(currentParams.toString());
    // Set or remove searchQuery
    if (newTerm) {
      params.set('searchQuery', newTerm);
    } else {
      params.delete('searchQuery');
    }

    // If we have filterOptions, set or remove filterBy
    if (filterOptions) {
      if (newFilter) {
        params.set('filterBy', newFilter);
      } else {
        params.delete('filterBy');
      }
    } else {
      // If no filterOptions, just remove filterBy if it exists
      params.delete('filterBy');
    }
    // Reset page to 1
    params.set('page', '1');
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Debounced callback for typing in the input UNUSE
  const debouncedUpdateUrl = useDebouncedCallback((textVal) => {
    updateUrl(filterBy, textVal);
  }, 1_000_000);

  // Handle text changes with debouncing
  function onTextChange(e) {
    const newVal = e.target.value;
    setTerm(newVal);
    debouncedUpdateUrl(newVal);
  }

  // Handle filter changes WITHOUT immediate update
  function onFilterChange(e) {
    setFilterBy(e.target.value);
  }

  // Click Search to do an immediate update
  function onSearchClick() {
    debouncedUpdateUrl.cancel();
    updateUrl(filterBy, term);
  }

  const isFetching = useIsFetching({
    queryKey: [tanstackQueryKey]
  });
  // 2) We'll consider "loading" if isFetching > 0
  const isLoading = isFetching > 0;

  return (
    <div style={{ margin: '1rem 0' }}>
      {/* If filterOptions is provided, show the Filter By <select> */}
      {filterOptions && (
        <>
          <label>Filter By: </label>
          <select
            value={filterBy}
            onChange={onFilterChange}
            style={{ marginRight: '0.5rem' }}
          >
            {Object.entries(filterOptions).map(([val, label]) => (
              <option key={val} value={val}>
                {label}
              </option>
            ))}
          </select>
        </>
      )}

      <label>Search: </label>
      <input
        type="text"
        value={term}
        onChange={onTextChange}
        placeholder={placeholder}
        style={{ marginRight: '0.5rem' }} 
      />

<button onClick={onSearchClick} disabled={isLoading}>
        {isLoading ? 'Searching...' : 'Search'}
      </button>
    </div>
  );
}
