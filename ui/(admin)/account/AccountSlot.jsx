// ui/(admin)/account/AccountSlot.jsx
'use client'; // It's rendering dynamic data from React Query

import Link from 'next/link';

export default function AccountSlot({ acc }) {
  return (
    <tr>
      <td>{acc.id}</td>
      <td>{acc.name}</td>
      <td>
        {acc.year}#{acc.departmentAbbrev || '—'}
      </td>
      <td>{acc.role}</td>
      <td>
        <Link href={`/account/manage/${acc.id}`}>Manage</Link>
      </td>
    </tr>
  );
}
