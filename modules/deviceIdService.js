// modules/deviceIdService.js
import crypto from 'crypto';
import { z } from 'zod';

/**
 * Environment Variables
 */
const DEVICE_ID_SECRET = process.env.DEVICE_ID_SECRET;
const DEVICE_ID_ENCRYPT = process.env.DEVICE_ID_ENCRYPT;

/**
 * Quick check for required env variables. If missing, we'll handle it in each function
 * so we can return a consistent error object.
 */
function _validateEnvVars() {
  if (!DEVICE_ID_SECRET || !DEVICE_ID_ENCRYPT) {
    return {
      success: false,
      error: 'ERR_ENV_MISSING',
      message: 'Environment variables DEVICE_ID_SECRET or DEVICE_ID_ENCRYPT not set.',
    };
  }
  return { success: true };
}

/**
 * getOrResetDeviceId(cookieStore, userIp = '0.0.0.0'):
 *   1) Reads 'deviceId' from cookies.
 *   2) Decodes & verifies HMAC. If invalid => create a new deviceId.
 *   3) Sets the cookie with the valid deviceId (encrypted).
 *   4) Returns the plaintext deviceId or an error object.
 *
 * Return:
 *  { success: true, deviceId } or { success: false, error, message }
 */
export async function getOrResetDeviceId(cookieStore, userIp = '0.0.0.0') {
  // 1) Check env first
  const envCheck = _validateEnvVars();
  if (!envCheck.success) return envCheck;

  try {
    const deviceCookieVal = cookieStore.get('deviceId')?.value;
    let deviceId = '';

    // attempt decode
    if (deviceCookieVal) {
      const decoded = _decodeDeviceCookie(deviceCookieVal);
      if (decoded.valid) {
        deviceId = decoded.deviceId;
      }
    }

    // if invalid or no cookie => create new
    if (!deviceId) {
      const newRes = _createNewDeviceId(userIp);
      if (!newRes.success) return newRes;
      deviceId = newRes.deviceId;
    }

    // encrypt & store
    const encRes = _encodeDeviceCookie(deviceId);
    if (!encRes.success) return encRes;

    await cookieStore.set('deviceId', encRes.encrypted, {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });

    return { success: true, deviceId };
  } catch (err) {
    console.error('[getOrResetDeviceId] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN_DEVICEID',
      message: 'An unexpected error occurred while generating deviceId.',
    };
  }
}

/**
 * getOrResetDeviceIdMiddleware:
 *  - Creates or updates the 'deviceId' cookie if missing
 *  - Now expects a fully awaited cookieStore
 */
export function getOrResetDeviceIdMiddleware(userCookie,cookieStore, userIp = '0.0.0.0') {
  const envCheck = _validateEnvVars();
  if (!envCheck.success) {
    return envCheck; // { success: false, error, message }
  }

  try {
    const deviceCookieVal = userCookie.get('deviceId');
    let deviceId = '';

    if (deviceCookieVal) {
      const decoded = _decodeDeviceCookie(deviceCookieVal.value);
      if (decoded.valid) {
        deviceId = decoded.deviceId;
      }
    }

    if (!deviceId) {
      const newRes = _createNewDeviceId(userIp);
      if (!newRes.success) return newRes;
      deviceId = newRes.deviceId;
    }

    const encRes = _encodeDeviceCookie(deviceId);
    if (!encRes.success) return encRes;

    cookieStore.set('deviceId', encRes.encrypted, {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: 365 * 24 * 60 * 60, // 1 year
    });

    return { success: true, deviceId };
  } catch (err) {
    console.error('[getOrResetDeviceIdMiddleware] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN_DEVICEID',
      message: 'An unexpected error occurred while generating deviceId.',
    };
  }
}


export function getAndValidDeviceId(userCookie) {
  // 1) read deviceId cookie
  const deviceCookieVal = userCookie.get('deviceId')?.value;
  if (!deviceCookieVal) {
    return { valid: false };
  }

  // 2) decode & verify
  const decoded = _decodeDeviceCookie(deviceCookieVal);
  if (!decoded.valid) {
    return { valid: false };
  }

  // 3) success => we have a deviceId
  return {
    valid: true,
    deviceId: decoded.deviceId,
  };
}


/**
 * forceResetDeviceId(cookieStore, userIp = '0.0.0.0'):
 *   - Ignores any existing cookie. Always creates a brand new deviceId.
 *   - Sets the cookie. Returns { success: true, deviceId } or { success: false, ... }.
 */
export async function forceResetDeviceId(cookieStore, userIp = '0.0.0.0') {
  const envCheck = _validateEnvVars();
  if (!envCheck.success) return envCheck;

  try {
    const newRes = _createNewDeviceId(userIp);
    if (!newRes.success) return newRes;

    const encRes = _encodeDeviceCookie(newRes.deviceId);
    if (!encRes.success) return encRes;

    await cookieStore.set('deviceId', encRes.encrypted, {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: 365 * 24 * 60 * 60,
    });

    return { success: true, deviceId: newRes.deviceId };
  } catch (err) {
    console.error('[forceResetDeviceId] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN_DEVICEID',
      message: 'An unexpected error occurred while force-resetting deviceId.',
    };
  }
}

/**
 * computeDeviceIdData(deviceCookieVal, userIp = '0.0.0.0'):
 *   1) decode deviceCookieVal
 *   2) if invalid => create new
 *   3) return { success: true, deviceId, encrypted, isNew } or { success: false, ... }
 *
 * Note: This function doesn't set the cookie; it just returns the data needed to do so.
 */
export function computeDeviceIdData(deviceCookieVal = '', userIp = '0.0.0.0') {
  const envCheck = _validateEnvVars();
  if (!envCheck.success) return envCheck;

  try {
    let deviceId = '';
    if (deviceCookieVal) {
      const decoded = _decodeDeviceCookie(deviceCookieVal);
      if (decoded.valid) {
        deviceId = decoded.deviceId;
      }
    }

    let isNew = false;
    if (!deviceId) {
      const newRes = _createNewDeviceId(userIp);
      if (!newRes.success) return newRes;
      deviceId = newRes.deviceId;
      isNew = true;
    }

    const encRes = _encodeDeviceCookie(deviceId);
    if (!encRes.success) return encRes;

    return {
      success: true,
      deviceId,
      encrypted: encRes.encrypted,
      isNew,
    };
  } catch (err) {
    console.error('[computeDeviceIdData] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN_DEVICEID',
      message: 'An unexpected error occurred while computing deviceId data.',
    };
  }
}

//
// ============== Private Helpers ==============
//

/**
 * _createNewDeviceId(userIp):
 *   - Creates a brand-new deviceId by hashing:
 *     userIp + current timestamp + random(16 bytes) + DEVICE_ID_SECRET
 *   - Returns { success: true, deviceId } or { success: false, error, message }.
 */
function _createNewDeviceId(userIp) {
  try {
    const randomPart = crypto.randomBytes(16).toString('hex');
    const raw = `${userIp}-${Date.now()}-${randomPart}-${DEVICE_ID_SECRET}`;
    const deviceId = crypto.createHash('sha256').update(raw).digest('hex');
    return { success: true, deviceId };
  } catch (err) {
    console.error('[_createNewDeviceId] Error:', err);
    return {
      success: false,
      error: 'ERR_DEVICEID_GEN',
      message: 'Failed to generate new deviceId.',
    };
  }
}

/**
 * _encodeDeviceCookie(deviceId):
 *   - 1) HMAC with DEVICE_ID_SECRET
 *   - 2) AES encrypt the "deviceId.hmac"
 *   - returns { success: true, encrypted } or { success: false, error, message }
 */
function _encodeDeviceCookie(deviceId) {
  try {
    const hmac = crypto.createHmac('sha256', DEVICE_ID_SECRET).update(deviceId).digest('hex');
    const combined = `${deviceId}.${hmac}`;

    const enc = _encryptAES(combined, DEVICE_ID_ENCRYPT);
    if (!enc.success) return enc;

    return { success: true, encrypted: enc.encrypted };
  } catch (err) {
    console.error('[_encodeDeviceCookie] Error:', err);
    return {
      success: false,
      error: 'ERR_ENCODE_COOKIE',
      message: 'Failed to encode device cookie.',
    };
  }
}

/**
 * _decodeDeviceCookie(encoded):
 *   - 1) AES decrypt
 *   - 2) parse "deviceId.hmac"
 *   - 3) verify HMAC
 *   - returns { valid: boolean, deviceId? }
 */
function _decodeDeviceCookie(encoded) {
  try {
    const dec = _decryptAES(encoded, DEVICE_ID_ENCRYPT);
    if (!dec.success || !dec.decrypted) return { valid: false };

    const decrypted = dec.decrypted;
    if (!decrypted.includes('.')) return { valid: false };

    const [rawDeviceId, cookieHmac] = decrypted.split('.');
    const parseResult = z.string().min(1).max(256).safeParse(rawDeviceId);
    if (!parseResult.success) {
      return { valid: false };
    }

    const check = crypto.createHmac('sha256', DEVICE_ID_SECRET).update(rawDeviceId).digest('hex');
    return { valid: check === cookieHmac, deviceId: rawDeviceId };
  } catch {
    return { valid: false };
  }
}

/**
 * _encryptAES(plainText, secretKey):
 *   returns { success: true, encrypted } or { success: false, error, message }
 */
function _encryptAES(plainText, secretKey) {
  try {
    const iv = crypto.randomBytes(16);
    const key = crypto.scryptSync(secretKey, 'mysalt', 32);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);

    const encryptedBuffer = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);
    const combinedBuffer = Buffer.concat([iv, encryptedBuffer]);
    return {
      success: true,
      encrypted: combinedBuffer.toString('base64'),
    };
  } catch (err) {
    console.error('[_encryptAES] Error:', err);
    return {
      success: false,
      error: 'ERR_ENCRYPT_AES',
      message: 'Failed to AES-encrypt deviceId data.',
    };
  }
}

/**
 * _decryptAES(encoded, secretKey):
 *   returns { success: true, decrypted } or { success: false, error, message }
 */
function _decryptAES(encoded, secretKey) {
  try {
    const combinedBuffer = Buffer.from(encoded, 'base64');
    const iv = combinedBuffer.slice(0, 16);
    const encrypted = combinedBuffer.slice(16);
    const key = crypto.scryptSync(secretKey, 'mysalt', 32);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decryptedBuffer = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return {
      success: true,
      decrypted: decryptedBuffer.toString('utf8'),
    };
  } catch (err) {
    // We'll just log it and return a fail object; the caller checks `valid: false`.
    console.error('[_decryptAES] Error:', err);
    return {
      success: false,
      error: 'ERR_DECRYPT_AES',
      message: 'Failed to AES-decrypt deviceId data.',
    };
  }
}
