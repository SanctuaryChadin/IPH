// modules/sessionService.js
import crypto from 'crypto';
import { runTransaction } from '../lib/db.js';
import { redis, redisGetJSON, redisSetJSON, redisDel } from '../lib/redis.js';
import { z } from 'zod';


const SESSION_SECRET = process.env.SESSION_SECRET;
const MAX_SESSIONS = 3;

const HARD_LIMIT_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SOFT_LIMIT_MS = 24 * 60 * 60 * 1000; // 1 day
const ROTATE_INTERVAL_MS = 15 * 60 * 1000;    // 15 min

/**
 * loginUserSession
 *  1) Remove old (userId, deviceId) row (DB).
 *  2) Insert new session => newSessionId (DB).
 *  3) If > MAX_SESSIONS => remove oldest (DB).
 *  4) remove from Redis in parallel.
 *  5) create new cookieId, store in Redis, set cookie in parallel.
 * 
 * Returns:
 *  { success: true, cookieId } on success
 *  { success: false, error, message } on error
 */
export async function loginUserSession(
  cookieStore,
  {
    userId,
    deviceId,
    userAgent = '',
    ip = '',
    role = 'user',
  }
) {
  let oldSessionId = null;
  let removedSessionIds = [];
  let newSessionId = null;

  try {
    // Step (1)-(3): DB transaction
    await runTransaction(async (client) => {
      const delOld = `
        DELETE FROM session
        WHERE "userId" = $1
          AND "deviceId" = $2
        RETURNING id
      `;
      const { rows: oldRows } = await client.query(delOld, [userId, deviceId]);
      if (oldRows.length > 0) {
        oldSessionId = oldRows[0].id;
      }
      

      newSessionId = _makeSessionId();
      const now = new Date();
      const insQ = `
        INSERT INTO session (id, "userId", "deviceId", "userAgent", ip, "createAt", "lastActive")
        VALUES ($1, $2, $3, $4, $5, $6, $6)
      `;
      await client.query(insQ, [newSessionId, userId, deviceId, userAgent, ip, now]);

      const selAll = `
        SELECT id
        FROM session
        WHERE "userId" = $1
        ORDER BY "lastActive" ASC
      `;
      const { rows } = await client.query(selAll, [userId]);
      if (rows.length > MAX_SESSIONS) {
        const removeCount = rows.length - MAX_SESSIONS;
        const oldest = rows.slice(0, removeCount).map((r) => r.id);

        const delBatch = `
          DELETE FROM session
          WHERE id = ANY($1::text[])
          RETURNING id
        `;
        const { rows: delRows } = await client.query(delBatch, [oldest]);
        removedSessionIds = delRows.map((r) => r.id);
      }
    });
  } catch (dbErr) {
    // DB transaction failed
    console.error('[loginUserSession] DB Error:', dbErr);
    return {
      success: false,
      error: 'ERR_DB_TRANSACTION',
      message: 'Database transaction failed while creating session.',
    };
  }
  try {
    const allRemovedIds = [];
    if (oldSessionId) allRemovedIds.push(oldSessionId);
    if (removedSessionIds.length) allRemovedIds.push(...removedSessionIds);

    const nowMs = Date.now();
    const cookieId = _makeCookieId(newSessionId, deviceId, nowMs, SESSION_SECRET);

    const sessionData = {
      dbSessionId: newSessionId,
      userId,
      deviceId,
      role,
      lastActive: nowMs,
    };

    // Do these in parallel
    await Promise.all([
      _removeSessionsFromRedis(userId, allRemovedIds),
      // store new session
      redisSetJSON(`session:${cookieId}`, sessionData, SOFT_LIMIT_MS / 1000),
      // add to userSessions set
      redis.sadd(`userSessions:${userId}`, cookieId),
      // set cookie
      cookieStore.set('cookieId', cookieId, {
        path: '/',
        httpOnly: true,
        secure: true,
        maxAge: SOFT_LIMIT_MS / 1000,
      }),
    ]);

    return { success: true, cookieId };
  } catch (redisErr) {
    // If we failed here, we have partial success in DB (the session row is inserted).
    // We can attempt to remove the new session from DB as a rollback, or just log it.
    console.error('[loginUserSession] Redis/Cookie Error:', redisErr);

    // Attempt a best-effort rollback in DB if you want:
    // If newSessionId is set, remove it:
    if (newSessionId) {
      try {
        await _deleteDbSession(newSessionId);
      } catch (rollbackErr) {
        console.error('[loginUserSession] Rollback DB Error:', rollbackErr);
        // If this also fails, we have a stale row in DB. Possibly a cleanup job needed.
      }
    }

    return {
      success: false,
      error: 'ERR_REDIS_OR_COOKIE',
      message: 'Failed to update Redis or set the cookie. Changes in DB have been rolled back if possible.',
    };
  }
}


export async function sessionValid(cookieStore, { deviceId }) {
  const cVal = cookieStore.get('cookieId');
  if (!cVal) {
    return { valid: false };
  }

  const cookieId = cVal.value;
  // fetch from Redis
  const redisKey = `session:${cookieId}`;
  const sData = await redisGetJSON(redisKey);
  if (!sData) {
    return { valid: false };
  }

  // device mismatch
  if (sData.deviceId !== deviceId) {
    return { valid: false };
  }

  // check if we need rotation => if yes => return { valid: false } so the heavier logic can do it
  const now = Date.now();
  const elapsed = now - sData.lastActive;
  if (elapsed > ROTATE_INTERVAL_MS) {
    return { valid: false };
  }
  return {
    valid: true,
    userId: sData.userId,
    role: sData.role,
  };
}

/**
 * validateSessionMiddleware
 *  1) parse cookie
 *  2) check Redis
 *  3) device mismatch => logout
 *  4) if need rotation => fetch DB row => rotate
 *  5) else => return user data
 *
 * Returns:
 *  { success: true, userId, role } or { success: false, error, message }
 */
export async function validateSessionMiddleware(userCookie,cookieStore, { deviceId, userIp, userAgent }) {
  try {
    // 1) parse cookie
    const cVal = userCookie.get('cookieId');
    if (!cVal) {
      cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
      return {
        success: false,
        error: 'ERR_INVALID_COOKIE',
        message: 'Cookie is missing.',
      };
    }
    const cookieId = cVal.value;

    // 2) from Redis
    const redisKey = `session:${cookieId}`;
    const sData = await redisGetJSON(redisKey);
    if (!sData) {
      cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
      return {
        success: false,
        error: 'ERR_SESSION_NOT_FOUND',
        message: 'Session not found in Redis.',
      };
    }

    // 3) device mismatch => logout
    if (sData.deviceId !== deviceId) {
      await logoutUserSessionMiddleware(cookieId, cookieStore);
      return {
        success: false,
        error: 'ERR_DEVICE_MISMATCH',
        message: 'Device ID does not match the session record.',
      };
    }

   // 4) check rotation
   const now = Date.now();
   const elapsed = now - sData.lastActive;
   if (elapsed > ROTATE_INTERVAL_MS) {
      // we fetch DB row
      let dbRow;
      try {
        dbRow = await _fetchSessionRow(sData.dbSessionId);
      } catch (dbErr) {
        console.error('[validateSessionMiddleware] DB Error on fetch:', dbErr);
        // If DB is down, we can't rotate. 
        // Could either logout the user, or treat it as a transient error.
        return {
          success: false,
          error: 'ERR_DB_FETCH',
          message: 'Could not fetch session row from DB to rotate.',
        };
      }

      if (!dbRow) {
        // session not in DB => remove from redis + userSessions
        cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
        await Promise.all([
          redisDel(redisKey),
          redis.srem(`userSessions:${sData.userId}`, cookieId),
        ]);
        return {
          success: false,
          error: 'ERR_DB_SESSION_NOT_FOUND',
          message: 'Session row not found in DB. Removed from Redis.',
        };
      }

      const createTime = dbRow.createAt.getTime();
      const lastActiveTime = dbRow.lastActive.getTime();
      if (
        now - createTime > HARD_LIMIT_MS ||
        now - lastActiveTime > SOFT_LIMIT_MS
      ) {
        cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
        // beyond 7 days or lastActive too old
        await Promise.all([
          _deleteDbSession(dbRow.id),
          redisDel(redisKey),
          redis.srem(`userSessions:${dbRow.userId}`, cookieId),
        ]);
        return {
          success: false,
          error: 'ERR_SESSION_EXPIRED',
          message: 'Session expired per hard/soft limit.',
        };
      }

      // rotate
      const newCookieId = _makeCookieId(dbRow.id, dbRow.deviceId, now, SESSION_SECRET);
      const rotatedData = {
        dbSessionId: dbRow.id,
        userId: dbRow.userId,
        deviceId: dbRow.deviceId,
        role: sData.role,
        lastActive: now,
      };

      // Do these in parallel
      try {
        await Promise.all([
          // remove old session
          redisDel(redisKey),
          redis.srem(`userSessions:${dbRow.userId}`, cookieId),
          // update DB lastActive, ip, userAgent
          runTransaction(async (client) => {
            const upd = `
              UPDATE session
              SET ip = $1,
                  "userAgent" = $2,
                  "lastActive" = NOW()
              WHERE id = $3
            `;
            await client.query(upd, [userIp, userAgent, dbRow.id]);
          }),
          // store new session in Redis
          redisSetJSON(`session:${newCookieId}`, rotatedData, SOFT_LIMIT_MS / 1000),
          // add new cookieId to userSessions
          redis.sadd(`userSessions:${dbRow.userId}`, newCookieId),
        ]);
      } catch (rotateErr) {
        console.error('[validateSessionMiddleware] Rotation Error:', rotateErr);
        // best-effort cleanup: remove new DB changes, etc. 
        // But we already updated lastActive in DB. 
        // We can do a partial rollback if we want. 
        return {
          success: false,
          error: 'ERR_ROTATION_FAILED',
          message: 'Failed to rotate session, partial changes may exist.',
        };
      }

      // set new cookie
      cookieStore.set('cookieId', newCookieId, {
        path: '/',
        httpOnly: true,
        secure: true,
        maxAge: SOFT_LIMIT_MS / 1000,
      });
      console.log('sessionRotage');
      return {
        success: true,
        userId: rotatedData.userId,
        role: rotatedData.role,
      };
    }
    console.log('sessionNorotage');
    // No rotation => just return
    return {
      success: true,
      userId: sData.userId,
      role: sData.role,
    };
  } catch (err) {
    // Catch-all block
    console.error('[validateSessionMiddleware] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN',
      message: 'An unexpected error occurred validating the session.',
    };
  }
}

/**
 * logoutUserSessionMiddleware:
 *  1) given cookieId, remove from DB, from redis, from userSessions
 *  2) clear cookie
 * 
 * Returns:
 *  { success: true } or { success: false, error, message }
 */
export async function logoutUserSessionMiddleware(cookieId, cookieStore) {
  try {
    const key = `session:${cookieId}`;
    const sData = await redisGetJSON(key);
    if (sData) {
      await Promise.all([
        _deleteDbSession(sData.dbSessionId),
        redisDel(key),
        redis.srem(`userSessions:${sData.userId}`, cookieId),
      ]);
    }
    cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
    return { success: true };
  } catch (err) {
    console.error('[logoutUserSessionMiddleware] Error:', err);
    return {
      success: false,
      error: 'ERR_LOGOUT_FAILED',
      message: 'Failed to logout session fully; partial stale data may remain.',
    };
  }
}

/*  old wrong code not update yet and not using right now
export async function validateSession(cookieStore, { deviceId = '', userIp = '', userAgent = '' }) {
  // 1) read cookie
  const cVal = cookieStore.get('cookieId')?.value ?? '';
  const parseCookie = z.string().max(256).safeParse(cVal);
  if (!parseCookie.success) {
    await cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
    return null;
  }
  const cookieId = parseCookie.data;

  // 2) from Redis
  const redisKey = `session:${cookieId}`;
  const sData = await redisGetJSON(redisKey);
  if (!sData) {
    await cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
    return null;
  }

  // 3) DB row => check createAt
  const dbRow = await _fetchSessionRow(sData.dbSessionId);
  if (!dbRow) {
    // session not in DB => remove from redis
    await redisDel(redisKey);
    await cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
    // remove from userSessions
    await redis.srem(`userSessions:${sData.userId}`, cookieId);
    return null;
  }

  const createTime = dbRow.createAt.getTime();
  const lastActiveTime = dbRow.lastActive.getTime();
  const now = Date.now();
  if (now - createTime > HARD_LIMIT_MS || now - lastActiveTime > SOFT_LIMIT_MS) {
    // beyond 7 days
    await _deleteDbSession(dbRow.id);
    await redisDel(redisKey);
    await cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });
    await redis.srem(`userSessions:${dbRow.userId}`, cookieId);
    return null;
  }

  // 4) device mismatch => tampering => logout
  if (dbRow.deviceId !== deviceId) {
    await logoutUserSession(cookieStore);
    return null;
  }

  // 5) check rotation
  const elapsed = now - sData.lastActive;
  if (elapsed > ROTATE_INTERVAL_MS) {
    // rotate
    const newCookieId = _makeCookieId(dbRow.id, dbRow.deviceId, now, SESSION_SECRET);
    await redisDel(redisKey);
    await redis.srem(`userSessions:${dbRow.userId}`, cookieId);

    // update DB lastActive, ip, userAgent
    await runTransaction(async (client) => {
      const upd = `
        UPDATE session
        SET ip = $1,
            "userAgent" = $2,
            "lastActive" = NOW()
        WHERE id = $3
      `;
      await client.query(upd, [userIp, userAgent, dbRow.id]);
    });

    const rotatedData = {
      dbSessionId: dbRow.id,
      userId: dbRow.userId,
      deviceId: dbRow.deviceId,
      role: sData.role,
      lastActive: now,
    };
    await redisSetJSON(`session:${newCookieId}`, rotatedData, SOFT_LIMIT_MS/1000);
    await redis.sadd(`userSessions:${dbRow.userId}`, newCookieId);

    // set new cookie
    await cookieStore.set('cookieId', newCookieId, {
      path: '/',
      httpOnly: true,
      secure: true,
      maxAge: SOFT_LIMIT_MS/1000,
    });

    return { userId: rotatedData.userId, role: rotatedData.role };
  }

  // no rotation => we just return
  return { userId: sData.userId, role: sData.role };
}
*/



/**
 * logoutUserSession(cookieStore):
 *  - read cookieId => remove from DB, remove from redis, remove from userSessions => clear cookie
 */
export async function logoutUserSession(cookieStore) {
  try {
    // 1) Read cookieId
    const cVal = cookieStore.get('cookieId')?.value ?? '';
    const parsed = z.string().max(256).safeParse(cVal);
    if (!parsed.success) {
      // Cookie is missing or invalid
      return {
        success: false,
        error: 'ERR_INVALID_COOKIE',
        message: 'No valid cookie found for logout.',
      };
    }

    const cookieId = parsed.data;
    const key = `session:${cookieId}`;

    // 2) Load session data from Redis
    let sData;
    try {
      sData = await redisGetJSON(key);
    } catch (redisErr) {
      console.error('[logoutUserSession] Redis read error:', redisErr);
      return {
        success: false,
        error: 'ERR_REDIS_FAILURE',
        message: 'Could not read session from Redis for logout.',
      };
    }

    if (sData) {
      const { dbSessionId, userId } = sData;

      // Remove from DB, Redis, userSessions in parallel
      try {
        await Promise.all([
          _deleteDbSession(dbSessionId),     // remove from DB
          redisDel(key),                     // remove from redis
          redis.srem(`userSessions:${userId}`, cookieId), // remove from userSessions set
        ]);
      } catch (err) {
        // Possibly partial success if some operations succeeded
        console.error('[logoutUserSession] Partial failure on removing session:', err);
        return {
          success: false,
          error: 'ERR_LOGOUT_FAILED',
          message: 'Could not fully remove session data. Cookie will still be cleared.',
        };
      }
    }

    // 3) Clear cookie
    await cookieStore.set('cookieId', '', { path: '/', maxAge: 0 });

    return { success: true };
  } catch (err) {
    // Catch-all for unexpected errors
    console.error('[logoutUserSession] Unexpected Error:', err);
    return {
      success: false,
      error: 'ERR_UNKNOWN_LOGOUT',
      message: 'An unexpected error occurred during logout.',
    };
  }
}




// ================== Private Helpers ==================

function _makeSessionId() {
  // 64 hex
  return crypto.randomBytes(32).toString('hex');
}

function _makeCookieId(sessionId, deviceId, nowMs, secret) {
  const raw = `${sessionId}.${deviceId}.${nowMs}.${secret}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/**
 * We store session data with key: session:{cookieId}
 * We also store userSessions:{userId} => set of cookieIds
 * When removing by sessionId, we do a small search only in that userId set
 */
/**
 * removeSessionsFromRedis:
 *  For each user session, check if dbSessionId is in sessionIds. If so, remove from Redis.
 */
async function _removeSessionsFromRedis(userId, sessionIds) {
  const sessionSet = new Set(sessionIds);
  const setKey = `userSessions:${userId}`;

  try {
    const cookieIds = await redis.smembers(setKey);
    // Parallel approach if many cookieIds
    await Promise.all(cookieIds.map(async (cid) => {
      const redisKey = `session:${cid}`;
      const sData = await redisGetJSON(redisKey);
      if (!sData) {
        await redis.srem(setKey, cid);
        return;
      }
      if (sessionSet.has(sData.dbSessionId)) {
        await redisDel(redisKey);
        await redis.srem(setKey, cid);
      }
    }));
  } catch (err) {
    console.error('[_removeSessionsFromRedis] Error:', err);
    // not returning an error object because it's a private helper
    // The caller might handle it or log it.
  }
}


/** Grab minimal columns from DB: createAt, deviceId, userId */
/** 
 * _fetchSessionRow:
 *  returns { id, userId, deviceId, createAt, lastActive } or null
 */
async function _fetchSessionRow(sessionId) {
  try {
    const q = `
      SELECT id, "userId", "deviceId", "createAt", "lastActive"
      FROM session
      WHERE id = $1
      LIMIT 1
    `;
    const result = await runTransaction(async (client) => {
      const { rows } = await client.query(q, [sessionId]);
      return rows;
    });
    if (!result.length) return null;
    return {
      ...result[0],
      createAt: new Date(result[0].createAt),
      lastActive: new Date(result[0].lastActive),
    };
  } catch (err) {
    console.error('[_fetchSessionRow] DB Error:', err);
    throw err;  // re-throw so caller can handle
  }
}

/** 
 * _deleteDbSession
 *  deletes from DB
 */
async function _deleteDbSession(sessionId) {
  try {
    return runTransaction(async (client) => {
      await client.query('DELETE FROM session WHERE id=$1', [sessionId]);
    });
  } catch (err) {
    console.error('[_deleteDbSession] DB Error:', err);
    throw err; 
  }
}