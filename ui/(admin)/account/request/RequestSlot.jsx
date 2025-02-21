// ui/(admin)/account/request/RequestSlot.jsx
'use client';
import Link from 'next/link';

export default function RequestSlot({ acc }) {
  return (
    <tr>
      <td>{acc.id}</td>
      <td>{acc.name}</td>
      <td>{acc.email}</td>
      <td>
        <Link href={`/account/request/${acc.id}`}>Review</Link>
      </td>
    </tr>
  );
}
