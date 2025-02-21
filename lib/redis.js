// lib/redis.js
import Redis from 'ioredis';
export const redis = new Redis({
host: '127.0.0.1',
port: 6379,
password: '+]<H-y[PK({2h=D',
});

export async function redisSetJSON(key, data, ttlSeconds = 0) {
    const jsonString = JSON.stringify(data);
    await redis.set(key, jsonString);
    if (ttlSeconds > 0) {
      await redis.expire(key, ttlSeconds);
    }
  }
  
  export async function redisGetJSON(key) {
    const result = await redis.get(key);
    if (!result) return null;
    try {
      return JSON.parse(result);
    } catch (err) {
      // if parsing fails, return null or handle error
      return null;
    }
  }

  export async function redisDel(key) {
    await redis.del(key);
  }
  