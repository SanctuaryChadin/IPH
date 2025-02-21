
// app/(web)/page.js
import { cookies as nextCookies, headers as nextHeaders } from 'next/headers'
import { getOrResetDeviceId } from '@/modules/deviceIdService'
import { validateSession } from '@/modules/sessionService'
import Link from 'next/link';

export default async function HomePage() {
  // just minimal parse if you want



    return (
      <main>
        <h1>Welcome Guest</h1>
        <Link href="/login">Login</Link>
        <br></br>
        <Link href="/register">Register</Link>
        <br></br>
        <Link href="/user">User</Link>
        <br></br>
        <Link href="/courier">Courier</Link>
        <br></br>
        <Link href="/account">Admin</Link>
      </main>
    )
  

  // If clientData => show role-based content
  if (clientData.role === 'admin') {
    return <h1>Welcome, Admin!</h1>
  }
  if (clientData.role === 'courier') {
    return <h1>Welcome, Courier!</h1>
  }
  return <h1>Welcome, General User!</h1>
}
