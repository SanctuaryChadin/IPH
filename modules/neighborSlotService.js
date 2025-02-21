/**
 * neighborSlotService.js
 *
 * getNeighborSlotMap(slotIds, client) => returns a Map of slotId -> [ neighbor IDs ] 
 *
 * - If slotIds is a single number, we convert it to an array [slotIds].
 * - We do a single query: 
 *    SELECT slotMin, slotMax FROM neighborSlot 
 *    WHERE slotMin=ANY(...) OR slotMax=ANY(...)
 * - For each row, we fill out the adjacency in both directions. 
 * 
 * Example usage:
 *   const neighborMap = await getNeighborSlotMap([12,13,15], client);
 *   => neighborMap might be:
 *      {
 *        12: [13],
 *        13: [12,15],
 *        15: [13]
 *      }
 */
import { pool } from '@/lib/db.js';

export async function getNeighborSlotMap(slotIds, client = null) {
  // if we got a single number, convert it to an array
  if (!Array.isArray(slotIds)) {
    slotIds = [slotIds];
  }
  if (!slotIds.length) {
    // no slots => return empty map
    return new Map();
  }

  const localClient = client || (await pool.connect());
  let releaseAfter = false;
  if (!client) {
    // we created the connection, so we'll release it at end
    releaseAfter = true;
  }

  try {
    // single query
    // we do "WHERE slotMin=ANY($1) OR slotMax=ANY($1)" 
    // pass array of slotIds
    const sql = `
      SELECT "slotMin","slotMax"
      FROM "neighborSlot"
      WHERE "slotMin"=ANY($1)
         OR "slotMax"=ANY($1)
    `;
    const res = await localClient.query(sql, [slotIds]);

    // Build a map: slotId -> Set of neighbors
    const neighborMap = new Map();
    // Initialize each slot with an empty set, so we never skip them
    for (const sid of slotIds) {
      neighborMap.set(sid, new Set());
    }

    // For each row => if slotMin is in the input, then slotMax is a neighbor, and vice versa.
    for (let row of res.rows) {
      const sMin = row.slotMin;
      const sMax = row.slotMax;
      // If sMin is in slotIds, then sMax is a neighbor of sMin
      if (neighborMap.has(sMin)) {
        const s = neighborMap.get(sMin);
        s.add(sMax);
      }
      // If sMax is in slotIds, then sMin is a neighbor of sMax
      if (neighborMap.has(sMax)) {
        const s = neighborMap.get(sMax);
        s.add(sMin);
      }
    }

    // Convert each set to an array
    for (let [sid, setVal] of neighborMap.entries()) {
      neighborMap.set(sid, Array.from(setVal));
    }

    return neighborMap;
  } finally {
    if (!client && releaseAfter) {
      localClient.release();
    }
  }
}

/**
 * Helper getNeighborSlotIds for a single slot:
 * If you want just an array of neighbors, not a map.
 */
export async function getNeighborSlotIds(slotId, client=null) {
  const m = await getNeighborSlotMap([slotId], client);
  const arr = m.get(slotId) || [];
  return arr;
}
