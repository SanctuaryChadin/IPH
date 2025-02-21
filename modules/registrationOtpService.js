// modules/registrationOtpService.js
"use strict";

import crypto from 'crypto';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';
import { sendRegOtpEmail } from './emailService.js';

const REG_OTP_TTL_SECONDS = 5 * 60 + 15; // 5m15s
const REG_RESEND_COOLDOWN_MS = 90_000;   // 1m30s
const REG_MAX_OTP_DEVICES = 3;

/**
 * The new approach:
 * We do two Redis keys:
 *  1) `regOtp:${email.toLowerCase()}` => an object storing concurrency info across devices:
 *       { deviceId1: { createdAt }, deviceId2: {...}, ... }
 *  2) `reg:${email.toLowerCase()}:${deviceId}` => stores userData + refCode + otpCode, etc.
 * 
 * This ensures we can do "MAX_OTP_DEVICES" concurrency checks on the same email, 
 * while also storing the user data + OTP in a device-specific record.
 */


/** 
 * sendRegOtp:
 *   - If first-time => store user data in `reg:${email}:${deviceId}` 
 *   - If resend => keep existing user data, refresh OTP code
 */
export async function sendRegOtp(
  userData,           // Full user data (or empty if resend)
  email,
  deviceId,
  userName = "",
  deviceName = "unknownDevice",
  locationName = "unknownLocation"
) {
  if (!email || !deviceId) {
    return { error: ["invalidParam", "Missing email or deviceId"] };
  }

  /** 1) concurrency check across devices for this email */
  const concurrencyKey = `regOtp:${email.toLowerCase()}`;
  let concurrencyData = await redisGetJSON(concurrencyKey);
  if (!concurrencyData) concurrencyData = {};

  // e.g. concurrencyData = { deviceId1: { createdAt }, deviceId2: {...}, ... }
  const existingDeviceIds = Object.keys(concurrencyData);
  if (
    existingDeviceIds.length >= REG_MAX_OTP_DEVICES &&
    !existingDeviceIds.includes(deviceId)
  ) {
    return {
      error: [
        "deviceLimit",
        `Max device limit of ${REG_MAX_OTP_DEVICES} for registration try again later.`
      ]
    };
  }

  /** 2) device-specific record that stores user data + OTP code */
  const deviceKey = `reg:${email.toLowerCase()}:${deviceId}`;
  const now = Date.now();

  let existingRecord = await redisGetJSON(deviceKey);
  if (existingRecord) {
    // If we had a previous record, check cooldown
    if (now - (existingRecord.createdAt || 0) < REG_RESEND_COOLDOWN_MS) {
      return {
        error: [
          "cooldown",
          "Wait before requesting a new registration OTP (resend)."
        ]
      };
    }
  } else {
    existingRecord = {};
  }

  /** 3) If userData is non-empty => store/merge that into the record. 
   *    If we pass userData={} in a resend scenario, we keep the old user data. 
   */
  if (Object.keys(userData).length > 0) {
    existingRecord.userData = userData; // Overwrite or add new userData
  } else if (!existingRecord.userData) {
    // If we have absolutely no userData yet => error to avoid “hole”
    return {
      error: [
        "noUserData",
        "Cannot resend if no user data was ever stored."
      ]
    };
  }

  /** 4) Generate new refCode + otpCode */
  const refCode = _makeRefCode();
  const otpCode = _makeOtpCode();

  // Overwrite OTP details
  existingRecord.refCode = refCode;
  existingRecord.otpCode = otpCode;
  existingRecord.createdAt = now;
  existingRecord.attempt = 0; // reset attempts

  // Save back to Redis
  await redisSetJSON(deviceKey, existingRecord, REG_OTP_TTL_SECONDS);

  /**
   * 5) Update concurrency info. We add or refresh deviceId => { createdAt: now }. 
   */
  concurrencyData[deviceId] = { createdAt: now };
  await redisSetJSON(concurrencyKey, concurrencyData, REG_OTP_TTL_SECONDS);

  /** 6) Send the email */
  const mailRes = await sendRegOtpEmail(
    email,
    userName,
    otpCode,
    refCode,
    deviceName,
    locationName
  );
  if (!mailRes || mailRes.error) {
    // revert from concurrency & device store
    delete concurrencyData[deviceId];
    await redisSetJSON(concurrencyKey, concurrencyData, REG_OTP_TTL_SECONDS);

    await redisSetJSON(deviceKey, {}, REG_OTP_TTL_SECONDS);

    return { error: ["emailFail", "Failed to send registration OTP email"] };
  }

  return { success: true, refCode };
}


/** 
 * validateRegOtp:
 *   - We read from `reg:${email}:${deviceId}` 
 *   - Compare refCode & otpCode 
 *   - If success => return { success:true, userData } 
 *   - If fail => return { error: ... }
 */
export async function validateRegOtp(
  email,
  deviceId,
  refCode,
  otpCode
) {
  if (!email || !deviceId || !refCode || !otpCode) {
    return { error: ["invalidParam", "Missing param(s) for registration OTP"] };
  }

  const deviceKey = `reg:${email.toLowerCase()}:${deviceId}`;
  const record = await redisGetJSON(deviceKey);
  if (!record || !record.refCode) {
    return {
      error: ["notFound", "No registration OTP record found for this device/email"]
    };
  }

  // Check refCode
  if (record.refCode !== refCode) {
    return { error: ["refMismatch", "RefCode mismatch"] };
  }

  // Check OTP
  if (record.otpCode !== otpCode) {
    record.attempt = (record.attempt || 0) + 1;
    if (record.attempt >= 3) {
      // remove the record
      await redisSetJSON(deviceKey, {}, REG_OTP_TTL_SECONDS);
      return { error: ["maxAttempt", "Max attempts reached"] };
    }
    // store updated attempt
    await redisSetJSON(deviceKey, record, REG_OTP_TTL_SECONDS);
    return { error: ["otpMismatch", "Incorrect OTP"] };
  }

  // success => get userData
  const userData = record.userData || null;

  // Clear the record
  await redisSetJSON(deviceKey, {}, REG_OTP_TTL_SECONDS);

  return { success: true, userData };
}


// ============== Private Helpers ==============
function _makeRefCode() {
  return crypto.randomBytes(4).toString("hex"); // 8 hex characters
}
function _makeOtpCode() {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, "0");
}
