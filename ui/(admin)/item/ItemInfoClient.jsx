// ui/(admin)/item/ItemInfoClient.jsx
"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchActiveItems } from "@/app/(web)/(admin)/item/actions.js";
import Pagination from "@/ui/Pagination.jsx";

export default function ItemInfoClient() {
  const searchParams = useSearchParams();

  const rawQuery = searchParams.get("searchQuery") || "";
  const searchQuery = rawQuery.toLowerCase().trim();
  const filterBy =
    searchQuery === ""
      ? "id"
      : (searchParams.get("filterBy") || "id").trim();

  const page = parseInt(searchParams.get("page") || "1", 10);

  const { data } = useQuery({
    queryKey: ["items", filterBy, searchQuery, page],
    queryFn: () => searchActiveItems(filterBy, searchQuery, page),
    staleTime: 30_000,
    cacheTime: 30_000,
    suspense: true,
  });

  if (!data.items) {
    return null;
  }

  return (
    <>
      <p>
        <strong>Total:</strong> {data.totalCount} <br />
        <strong>Page:</strong> {data.page}
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
