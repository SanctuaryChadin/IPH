// app/(web)/(auth)/logout/actions.js
"use server";
import { cookies as nextCookies } from "next/headers";
import { logoutUserSession } from "@/modules/sessionService";

export async function logoutAction(formData) {
  const cookieStore = await nextCookies();
  const result = await logoutUserSession(cookieStore);
  return result; // e.g. { success: true } on success
}
