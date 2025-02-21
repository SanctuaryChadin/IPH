// app/api/auth/session/route.js
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { UAParser } from 'ua-parser-js';

import { getOrResetDeviceIdMiddleware,getAndValidDeviceId } from '@/modules/deviceIdService';
import { validateSessionMiddleware,sessionValid } from '@/modules/sessionService';

/**
 * Heavier logic route that:
 *  1. Awaits cookies()
 *  2. getOrResetDeviceIdMiddleware(...)
 *  3. validateSessionMiddleware(...)
 *  4. returns JSON with success or failure
 */
// app/api/auth/secure/route.js
const isDebug = false;

async function lightCheck(userCookie){
  const devValid = getAndValidDeviceId(userCookie);
  if (!devValid.valid) {
    console.log();
    if(isDebug)console.log({valid: false});
    return {valid: false};
  }
  const sessRes = await sessionValid(userCookie, { deviceId: devValid.deviceId });
  if (sessRes.valid) {
    if(isDebug)console.log(sessRes);
    return sessRes;
  }
  if(isDebug)console.log({valid: false});
  return {valid: false};
}


export async function GET(request) {

  const userCookie = request.cookies;

  const lightRes = await lightCheck(userCookie);
  if(lightRes.valid){
    if(isDebug)console.log({
      success: true,
      userId: lightRes.userId,
      role: lightRes.role,
    });
    return NextResponse.json({
      success: true,
      userId: lightRes.userId,
      role: lightRes.role,
    });
  }

  const realCookieStore = cookies();
  const cookiesToSet = [];
  const recordingCookieStore = createRecordingCookieStore(realCookieStore, cookiesToSet);

  const userIp = getUserIp(request);
  if(isDebug)console.log(userIp);

 const devRes = getOrResetDeviceIdMiddleware(userCookie, recordingCookieStore, userIp);
  if (!devRes.success) {
    const response = NextResponse.json({
      success: false,
      error: devRes.error,
      message: devRes.message,
    }, { status: 400 });

    // apply all recorded cookie sets
    for (const c of cookiesToSet) {
      response.cookies.set(c.name, c.value, c.options);
    }
    if(isDebug)console.log(response);
    return response;
  }

  const deviceId = devRes.deviceId;
  const userAgent = await getUserAgentString(request.headers);
  

  // 3) Validate (and possibly rotate) the session
  const sessionRes = await validateSessionMiddleware(userCookie, recordingCookieStore, {
    deviceId,
    userIp,
    userAgent,
  });
  if(isDebug)console.log(userCookie);

  if (!sessionRes.success) {
    const response = NextResponse.json({
      success: false,
      error: sessionRes.error,
      message: sessionRes.message,
    }, { status: 401 });

    // apply recorded cookies
    for (const c of cookiesToSet) {
      response.cookies.set(c.name, c.value, c.options);
    }
    if(isDebug)console.log(response);
    return response;
  }

  // 4) success => return userId, role
  const response = NextResponse.json({
    success: true,
    userId: sessionRes.userId,
    role: sessionRes.role,
  });

  // apply recorded cookies
  for (const c of cookiesToSet) {
    response.cookies.set(c.name, c.value, c.options);
  }

  return response;
}

// Helper to parse IP
function getUserIp(request) {
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    return xff.split(',')[0].trim();
  }
  return request.headers.get('x-real-ip') || '127.0.0.1';
}

function createRecordingCookieStore(actualCookieStore, cookiesToSet) {
  return {
    get(name) {
      // real .get()
      return actualCookieStore.get(name);
    },
    set(name, value, options) {
      // record the request to set a cookie, for later
      cookiesToSet.push({ name, value, options });
    },
  };
}
async function getUserAgentString(headersList) {
  // Grab the raw user-agent from headers
  const rawUA = headersList.get('user-agent') || 'UnknownAgent';

  // Parse it
  const parser = new UAParser(rawUA);

  // Extract details
  const { model } = parser.getDevice();
  const { name: osName, version: osVersion } = parser.getOS();
  const { name: browserName } = parser.getBrowser();

  // Build your one-line string
  const userAgent = [
    model || '',
    osName || '',
    osVersion || '',
    browserName || ''
  ]
    .join(' ')
    .trim()               // remove any extra leading/trailing spaces
    .replace(/\s+/g, ' '); // ensure multiple spaces collapse to one

  return userAgent; // e.g. "iPhone iOS 16 Safari"
}