// modules/otpService.js
import crypto from 'crypto';
import { redisGetJSON, redisSetJSON } from '../lib/redis.js';
import { sendOtpEmail } from './emailService.js';

const OTP_TTL_SECONDS = 5 * 60 + 15; // 5m15s
const RESEND_COOLDOWN_MS = 90_000;   // 1m30s
const MAX_OTP_DEVICES = 3;

/**
 * sendOtp:
 *   Single function for either first-time OTP or "resend" scenario.
 *   1) Load existing Redis data => an object: { deviceId1: {...}, deviceId2: {...}, ... }
 *   2) If we have 3 deviceIds and ours is not among them => error
 *   3) If ours is among them => check cooldown
 *   4) Generate new { refCode, otpCode, createdAt, attempt=0 }
 *   5) store => call email => if fail => revert
 */
export async function sendOtp(email, deviceId, userName = '', deviceName = 'unknownDevice', locationName = 'unknownLocation') {
  if (!email || !deviceId) {
    return { error: ['invalidParam', 'Missing email or deviceId'] };
  }

  const otpKey = _makeOtpKey(email);
  const data = (await redisGetJSON(otpKey)) || {};

  const existingDeviceIds = Object.keys(data);
  if (existingDeviceIds.length >= MAX_OTP_DEVICES && !existingDeviceIds.includes(deviceId)) {
    return { error: ['deviceLimit', `Max device limit of ${MAX_OTP_DEVICES} reached.`] };
  }

  // Check cooldown if deviceId already in data
  const existingRec = data[deviceId];
  const now = Date.now();
  if (existingRec) {
    if (now - existingRec.createdAt < RESEND_COOLDOWN_MS) {
      return { error: ['cooldown', 'Wait before requesting new OTP.'] };
    }
  }

  // generate fresh
  const refCode = _makeRefCode();
  const otpCode = _makeOtpCode();
  const newRec = {
    refCode,
    otpCode,
    createdAt: now,
    attempt: 0,
  };

  data[deviceId] = newRec;
  await redisSetJSON(otpKey, data, OTP_TTL_SECONDS);

  // send email
  const mailRes = await sendOtpEmail(email, userName, otpCode, refCode, deviceName, locationName);
  // We expect mailRes to be something like { success: true, info?: any } or { error: any }
  if (!mailRes || mailRes.error) {
    // revert
    delete data[deviceId];
    await redisSetJSON(otpKey, data, OTP_TTL_SECONDS);
    return { error: ['emailFail', 'Failed to send OTP email'] };
  }

  return { success: true, refCode };
}

/**
 * validateOtp:
 *   1) load from Redis => data[deviceId] => if missing => error
 *   2) compare refCode, if mismatch => error
 *   3) compare otpCode => if mismatch => attempt++, if >=3 => remove, else store
 *   4) if match => remove
 */
export async function validateOtp(email, deviceId, refCode, otpCode) {
  const otpKey = _makeOtpKey(email);
  const data = await redisGetJSON(otpKey);
  if (!data) {
    return { error: ['notFound', 'No OTP record for this email'] };
  }
  const record = data[deviceId];
  if (!record) {
    return { error: ['notFound', 'No OTP record for this device'] };
  }

  if (record.refCode !== refCode) {
    return { error: ['refMismatch', 'RefCode mismatch'] };
  }

  if (record.otpCode !== otpCode) {
    record.attempt += 1;
    if (record.attempt >= 3) {
      // remove
      delete data[deviceId];
      await redisSetJSON(otpKey, data, OTP_TTL_SECONDS);
      return { error: ['maxAttempt', 'Max attempts reached'] };
    }
    // store updated attempt
    data[deviceId] = record;
    await redisSetJSON(otpKey, data, OTP_TTL_SECONDS);
    return { error: ['otpMismatch', 'Incorrect OTP'] };
  }

  // success => remove from Redis
  delete data[deviceId];
  await redisSetJSON(otpKey, data, OTP_TTL_SECONDS);
  return { success: true };
}

// =============== Private Helpers ===============
function _makeOtpKey(email) {
  return `otp:${email.toLowerCase()}`;
}
function _makeRefCode() {
  return crypto.randomBytes(4).toString('hex'); // 8 hex characters
}
function _makeOtpCode() {
  const num = crypto.randomInt(0, 1_000_000);
  return num.toString().padStart(6, '0');
}

