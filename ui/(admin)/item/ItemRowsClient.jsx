// ui/(admin)/item/ItemRowsClient.jsx
"use client";

import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { searchActiveItems } from "@/app/(web)/(admin)/item/actions.js";
import ItemRowSlot from "./ItemRowSlot.jsx";

export default function ItemRowsClient() {
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

  if (!data.items || data.items.length === 0) {
    return (
      <tr>
        <td colSpan={6}>No items found.</td>
      </tr>
    );
  }

  return (
    <>
      {data.items.map((item) => (
        <ItemRowSlot key={item.id} item={item} />
      ))}
    </>
  );
}
