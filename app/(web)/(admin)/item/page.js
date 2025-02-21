// app/(web)/(admin)/item/page.js
import { Suspense } from "react";
import SearchBar from "@/ui/SearchBar.jsx";
import TableShell from "@/ui/TableShell.jsx";
import ItemRowsClient from "@/ui/(admin)/item/ItemRowsClient.jsx";
import ItemInfoClient from "@/ui/(admin)/item/ItemInfoClient.jsx";
import CreateItemFormClient from "@/ui/(admin)/item/CreateItemFormClient.jsx";

export const experimental_ppr = true;

export default function ItemLandingPage() {
  return (
    <div style={{ padding: "1rem" }}>
      <h2>Item Listing</h2>

      <CreateItemFormClient />

      <SearchBar
        placeholder="Search items..."
        // Using 'typeId' instead of 'type'
        filterOptions={{ id: "ID", name: "Name", typeId: "TypeID" }}
        tanstackQueryKey="items"
      />

      <TableShell columns={["ID", "Name", "TypeId", "Point", "Status", "Action"]}>
        <Suspense
          fallback={
            <tr>
              <td colSpan={6}>Loading rows…</td>
            </tr>
          }
        >
          <ItemRowsClient />
        </Suspense>
      </TableShell>

      <Suspense fallback={<div>Loading pagination…</div>}>
        <ItemInfoClient />
      </Suspense>
    </div>
  );
}
