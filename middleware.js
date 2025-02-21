// middleware.js
import { NextResponse } from 'next/server';

// A map from path prefix -> allowed roles (as Sets)
const PATH_ROLE_MAP = [
  {
    prefixes: ['/user'],
    allowedRoles: new Set(['user']),
  },
  {
    prefixes: ['/admin','/account','/item'],
    allowedRoles: new Set(['admin']),
  },
  {
    prefixes: ['/courier'],
    allowedRoles: new Set(['courier']),
  },
  {
    // If you want staff to include both courier & admin
    prefixes: ['/staff'],
    allowedRoles: new Set(['courier', 'admin']),
  },
  {
    // If you want staff to include both courier & admin
    prefixes: ['/logout'],
    allowedRoles: new Set(['user','courier', 'admin']),
  },
];

// If user is already logged in, you may want to block them from visiting /login
// or /register again. We'll handle that by a separate check (optional).
const BLOCK_LOGGED_IN_PATHS = ['/login', '/register'];

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // 1) Figure out if the path is protected, and what roles are required
  const requiredRoles = findRequiredRoles(pathname);

  const forUnauth = BLOCK_LOGGED_IN_PATHS.some((p) => pathname.startsWith(p));

  // If no required roles => path is not protected => let them pass
  if (!requiredRoles && !forUnauth) {
      return NextResponse.next();
    }

  // 2) This path *is* protected => check if user has any cookie
  const cookieIdVal = request.cookies.get('cookieId');
  if (!cookieIdVal) {
    if(forUnauth){
      return NextResponse.next();
    }
    // No cookie => definitely not logged in => redirect to /login
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 3) We have a cookie => do the "heavier" fetch to /api/auth/session
  //    to validate, rotate, etc. We pass:
  //    - The cookie string
  //    - The user’s IP (via a custom header)
  //    - Possibly user-agent, if you want
  const fullCookieStr = request.headers.get('cookie') ?? '';

// We'll look for deviceId and cookieId
let deviceId;
let cookieId;

// Parse cookies in a single pass
if (fullCookieStr) {
  const pairs = fullCookieStr.split(';');
  for (const pair of pairs) {
    const trimmed = pair.trim();
    if (!trimmed) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) continue;

    const name = trimmed.slice(0, equalIndex);
    const value = trimmed.slice(equalIndex + 1);

    if (name === 'deviceId') deviceId = value;
    if (name === 'cookieId') cookieId = value;

    // If we have both, we're done
    if (deviceId && cookieId) {
      break;
    }
  }
}

// Construct a minimal cookie string for just those two cookies
const selectedCookies = [];
if (deviceId) selectedCookies.push(`deviceId=${deviceId}`);
if (cookieId) selectedCookies.push(`cookieId=${cookieId}`);
const cookieStr = selectedCookies.join('; ');
  const userIp = getUserIp(request);

  // Build the route URL
  //  - We re-use the *current* host from request.url
  //    or override with NEXT_PUBLIC_SITE_URL if needed
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const secureRouteURL = new URL('/api/auth/session', baseUrl);

  const res = await fetch(secureRouteURL.toString(), {
    method: 'GET',
    headers: {
      Cookie: cookieStr,
      'x-forwarded-for': userIp, // pass IP so /api/auth/session can see it
      // You could also pass user-agent if desired
      'user-agent': request.headers.get('user-agent') ?? '',
    },
    cache: 'no-store',
  });

  // 4) If /api/auth/session returns an error or not okay => redirect

  if (!res.ok) {
    const newUrl = request.nextUrl.clone();
    newUrl.pathname = '/error';
    // Set a custom query param with your message
    newUrl.searchParams.set('msg', 'Session is invalid or expired');
  
    const response = NextResponse.rewrite(newUrl);
    try{
      const setCookieHeader = res.headers.get('set-cookie');
      if (setCookieHeader) {
        response.headers.set('Set-Cookie', setCookieHeader);
      }
    }catch (e){
      console.log(e);
    }finally{
      return response;
    }
  }

  const data = await res.json();
  if (!data.success) {
    if(forUnauth){
      const setCookieHeader = res.headers.get('set-cookie');
      const response = NextResponse.next();
      if (setCookieHeader) {
        response.headers.set('Set-Cookie', setCookieHeader);
      }
      return response;
    }
    // The route says session is invalid => go login
    const setCookieHeader = res.headers.get('set-cookie');
      const response = NextResponse.redirect(new URL('/login', request.url));
      if (setCookieHeader) {
        response.headers.set('Set-Cookie', setCookieHeader);
      }
      return response;
  }

  if(forUnauth){
    const setCookieHeader = res.headers.get('set-cookie');
    const response = NextResponse.redirect(new URL('/logout', request.url));
    if (setCookieHeader) {
      response.headers.set('Set-Cookie', setCookieHeader);
    }
    return response;
  }

  // 5) Check the user’s role from the data
  const userRole = data.role;
  if (!requiredRoles.has(userRole)) {
    // The user’s role is NOT allowed => 403
    // By default, you could redirect to a “403” or throw an error
    const setCookieHeader = res.headers.get('set-cookie');
      const response = NextResponse.rewrite(new URL('/error', request.url));
      if (setCookieHeader) {
        response.headers.set('Set-Cookie', setCookieHeader);
      }
      return response;
    // Or do: throw new Error(`Access Denied: role="${userRole}" not authorized here.`);
  }

  // 6) We got a successful session => apply any Set-Cookie header from /api/auth/session
  const setCookieHeader = res.headers.get('set-cookie');
  const response = NextResponse.next();

  if (setCookieHeader) {
    // If the route sets a cookie (rotate, fix, etc.), forward it to the browser
    response.headers.set('Set-Cookie', setCookieHeader);
  }

  return response;
}

/**
 * findRequiredRoles:
 *  - Figures out which set of roles is required for a given path.
 *  - If the path is not protected, return null (or undefined).
 */
function findRequiredRoles(pathname) {
  for (const { prefixes, allowedRoles } of PATH_ROLE_MAP) {
    // If any prefix matches the start of pathname => use that
    if (prefixes.some((pref) => pathname.startsWith(pref))) {
      return allowedRoles;
    }
  }
  return null; // Not a protected path
}

/**
 * Helper to parse IP from request
 *  - Next 13 doesn't have a built-in `request.ip` stable, so we do x-forwarded-for or x-real-ip
 */
function getUserIp(request) {
  // Try x-forwarded-for header
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}
