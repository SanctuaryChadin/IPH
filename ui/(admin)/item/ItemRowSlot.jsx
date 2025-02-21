// ui/(admin)/item/ItemRowSlot.jsx
"use client";

import Link from "next/link";

export default function ItemRowSlot({ item }) {
  return (
    <tr>
      <td>{item.id}</td>
      <td>{item.name}</td>
      <td>{item.typeId || "—"}</td>
      <td>{item.point}</td>
      <td>{item.status}</td>
      <td>
        <Link href={`/item/manage/${item.id}`}>Manage</Link>
      </td>
    </tr>
  );
}
