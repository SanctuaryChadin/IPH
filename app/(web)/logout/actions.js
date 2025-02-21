"use server";

import { cookies as nextCookies } from "next/headers";
import { logoutUserSession } from "@/modules/sessionService"; 
  // the module that has your "logoutUserSession(cookieStore)" function

/**
 * logoutAction:
 *  - Reads the user session from cookie
 *  - Calls logoutUserSession
 *  - Returns a result object to the client
 */
export async function logoutAction(formData) {
  // 1) Grab cookies
  const cookieStore = await nextCookies();

  // 2) Call your existing logout function
  const result = await logoutUserSession(cookieStore);

  // 3) Return that object
  //    e.g. { success: true } or { success: false, error: 'ERR_LOGOUT_FAILED', ...}
  return result;
}
