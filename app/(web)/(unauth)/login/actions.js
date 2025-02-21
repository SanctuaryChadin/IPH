// /app/(web)/(unauth)/login/actions.js
"use server";

import { headers as nextHeaders, cookies as nextCookies } from "next/headers";
import { UAParser } from "ua-parser-js";
import { getValidUserOrFail } from "@/modules/userService";
import { sendOtp, validateOtp } from "@/modules/otpService";
import { loginUserSession, logoutUserSession } from "@/modules/sessionService";
import { getOrResetDeviceId } from "@/modules/deviceIdService";

import { validateAndSanitize } from "@/modules/sanitizeService"; 
import {
  sendOtpSchema,
  resendOtpSchema,
  verifyOtpSchema,
} from "./loginSchema";
/**
 * A single "wizard" action that handles different steps:
 * 1) step=sendOtp
 * 2) step=resendOtp
 * 3) step=verifyOtp
 */
export async function loginWizardAction(_, formData) {
  try {
    // Convert FormData into a plain object
    const rawData = Object.fromEntries(formData.entries());

    // Determine the step from the rawData
    const { step } = rawData;
    if (!step) {
      return { error: "Missing step" };
    }

    // Decide which Zod schema to use based on step
    let chosenSchema;
    switch (step) {
      case "sendOtp":
        chosenSchema = sendOtpSchema;
        break;
      case "resendOtp":
        chosenSchema = resendOtpSchema;
        break;
      case "verifyOtp":
        chosenSchema = verifyOtpSchema;
        break;
      default:
        return { error: `Unknown step: ${step}` };
    }

    // === VALIDATE & SANITIZE ===
    const { valid, data, errors } = validateAndSanitize(rawData, chosenSchema);

    // If not valid, return a combined error (or field-by-field)
    if (!valid) {
      // For simplicity, we’ll just flatten them into a single string:
      const errorMsgs = Object.values(errors).flat().join(", ");
      return { error: errorMsgs };
    }

    // Now we can safely use `data` which is sanitized + validated
    const [headersList, cookieStore] = await Promise.all([
      nextHeaders(),
      nextCookies(),
    ]);

    // IP & location details, just like before
    let userIp =
      headersList.get("x-real-ip") ||
      headersList.get("x-forwarded-for") ||
      "127.0.0.1";
    if (userIp.includes(",")) {
      userIp = userIp.split(",")[0].trim();
    }
    const userAgentString = await getUserAgentString(headersList);
    const approxLocation = await getIpLocation(userIp);
    const deviceIdObj = await getOrResetDeviceId(cookieStore, userIp);

    // MAIN SWITCH (based on validated step)
    switch (data.step) {
      // ----------------------
      // STEP 1: Send OTP
      // ----------------------
      case "sendOtp": {
        // data.email is guaranteed to be a valid (and sanitized) email
        const user = await getValidUserOrFail(data.email);
        const otpRes = await sendOtp(
          data.email,
          deviceIdObj.deviceId,
          user.name,
          userAgentString,
          approxLocation
        );
        if (otpRes.error) {
          return { error: otpRes.error[1] };
        }

        // Return "ok" and nextStep is 'otp'
        return {
          ok: true,
          refCode: otpRes.refCode,
          nextStep: "otp",
        };
      }

      // ----------------------
      // STEP 2: Resend OTP
      // ----------------------
      case "resendOtp": {
        const user = await getValidUserOrFail(data.email);
        const otpRes = await sendOtp(
          data.email,
          deviceIdObj.deviceId,
          user.name,
          userAgentString,
          approxLocation
        );
        if (otpRes.error) {
          return { error: otpRes.error[1] };
        }

        // Next step remains 'otp'
        return {
          ok: true,
          refCode: otpRes.refCode,
          nextStep: "otp",
        };
      }

      // ----------------------
      // STEP 3: Verify OTP
      // ----------------------
      case "verifyOtp": {
        // data has email, refCode, otpCode safely parsed
        const user = await getValidUserOrFail(data.email);
        const valRes = await validateOtp(
          data.email,
          deviceIdObj.deviceId,
          data.refCode,
          data.otpCode
        );

        if (valRes.error) {
          return { error: valRes.error[1] };
        }

        // All good => create session
        await loginUserSession(cookieStore, {
          userId: user.id,
          deviceId: deviceIdObj.deviceId,
          userAgent: userAgentString,
          ip: userIp,
          role: user.role,
        });

        // Indicate success => client can redirect or do next step
        return { ok: true, nextStep: "success" };
      }

      default:
        // Should never happen, but just in case
        return { error: `Unknown step: ${data.step}` };
    }
  } catch (err) {
    return { error: err.message || "Something went wrong" };
  }
}

// ---------------------------
// Keep LOGOUT separate
// ---------------------------
export async function logoutAction() {
  try {
    const cookieStore = await nextCookies();
    const cookieIdVal = cookieStore.get("cookieId")?.value;
    if (cookieIdVal) {
      await logoutUserSession(cookieStore, cookieIdVal);
    }
    return { ok: true };
  } catch (err) {
    return { error: err.message || "Something went wrong" };
  }
}

// --------------
// Helper: parse userAgent
// --------------
async function getUserAgentString(headersList) {
  const rawUA = headersList.get("user-agent") || "UnknownAgent";
  const parser = new UAParser(rawUA);
  const { model } = parser.getDevice();
  const { name: osName, version: osVersion } = parser.getOS();
  const { name: browserName } = parser.getBrowser();

  const userAgent = [model || "", osName || "", osVersion || "", browserName || ""]
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
  return userAgent;
}

// --------------
// Helper: IP geolocation
// --------------
async function getIpLocation(ip) {
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`,{ cache: 'force-cache' });
    if (!res.ok) {
      return "Unknown location";
    }
    const data = await res.json();
    if (data?.city && data?.country_name) {
      return `${data.city}, ${data.country_name}`;
    }
    return "Unknown location";
  } catch (error) {
    console.error("Error fetching IP location:", error);
    return "Unknown location";
  }
}