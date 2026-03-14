import { parseSessionFile } from './parser.js';

/**
 * Stitch multiple session files into a single ordered array of records.
 * Handles deduplication, continuation detection, and filtering.
 * @param {Array<{filePath, sessionId}>} sessions - Session file info from discovery
 * @param {object} [options]
 * @param {boolean} [options.compact=false] - Only include user prompts + assistant text
 * @param {string} [options.grep] - Filter messages containing this string
 * @param {string} [options.since] - Include sessions after this date
 * @param {string} [options.until] - Include sessions before this date
 * @param {string[]} [options.sessionIds] - Only include these session IDs
 * @param {boolean} [options.full=false] - Include full tool call inputs/outputs
 * @param {boolean} [options.includeProgress=false] - Include progress records
 * @returns {Promise<{sessions: StitchedSession[], errors: number}>}
 */
export async function stitchSessions(sessions, options = {}) {
  const { compact = false, grep, since, until, sessionIds, full = false, includeProgress = false } = options;

  // Filter sessions by date range
  let filteredSessions = sessions;
  if (since) {
    const sinceDate = new Date(since);
    filteredSessions = filteredSessions.filter(s =>
      !s.timestamp || new Date(s.timestamp) >= sinceDate
    );
  }
  if (until) {
    const untilDate = new Date(until);
    filteredSessions = filteredSessions.filter(s =>
      !s.timestamp || new Date(s.timestamp) <= untilDate
    );
  }
  if (sessionIds) {
    const idSet = new Set(sessionIds);
    filteredSessions = filteredSessions.filter(s =>
      idSet.has(s.sessionId) || idSet.has(s.filePath)
    );
  }

  // Parse all sessions
  const allRecords = new Map(); // uuid → record (dedup)
  const sessionRecordMap = new Map(); // sessionId → records[]
  let totalErrors = 0;

  for (const session of filteredSessions) {
    const records = [];
    for await (const record of parseSessionFile(session.filePath, { includeProgress, full })) {
      if (record.type === '_parseError') {
        totalErrors += record.errorCount;
        continue;
      }

      // UUID deduplication: keep record with more content
      if (record.uuid && allRecords.has(record.uuid)) {
        const existing = allRecords.get(record.uuid);
        const existingLen = (existing.content || '').length;
        const newLen = (record.content || '').length;
        if (newLen <= existingLen) continue;
        // Remove old from its session group
        const oldGroup = sessionRecordMap.get(existing.sessionId);
        if (oldGroup) {
          const idx = oldGroup.indexOf(existing);
          if (idx >= 0) oldGroup.splice(idx, 1);
        }
      }

      if (record.uuid) allRecords.set(record.uuid, record);
      records.push(record);
    }

    // Group by actual sessionId (may differ from file name for continuations)
    for (const rec of records) {
      const sid = rec.sessionId;
      if (!sessionRecordMap.has(sid)) sessionRecordMap.set(sid, []);
      sessionRecordMap.get(sid).push(rec);
    }
  }

  // Build stitched sessions
  const stitchedSessions = [];
  for (const [sessionId, records] of sessionRecordMap) {
    // Sort records within session by parentUuid chain, falling back to array order
    const ordered = orderByParentChain(records);

    // Apply filters
    let filtered = ordered;

    if (compact) {
      filtered = filtered.filter(r =>
        r.type === 'user' || (r.type === 'assistant' && r.content && r.toolCalls?.length === 0)
      );
    }

    if (grep) {
      const lowerGrep = grep.toLowerCase();
      filtered = filtered.filter(r =>
        (r.content || '').toLowerCase().includes(lowerGrep)
      );
    }

    if (filtered.length === 0) continue;

    const firstTs = filtered.find(r => r.timestamp)?.timestamp;
    const lastTs = [...filtered].reverse().find(r => r.timestamp)?.timestamp;
    const models = [...new Set(filtered.filter(r => r.model).map(r => r.model))];

    stitchedSessions.push({
      sessionId,
      records: filtered,
      startTime: firstTs,
      endTime: lastTs,
      models,
    });
  }

  // Sort sessions by start time
  stitchedSessions.sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return new Date(a.startTime) - new Date(b.startTime);
  });

  return { sessions: stitchedSessions, errors: totalErrors };
}

/**
 * Order records by parentUuid chain.
 * Falls back to original array order for records not in a chain.
 */
function orderByParentChain(records) {
  if (records.length <= 1) return records;

  // Build parent→child map
  const byUuid = new Map();
  const byParent = new Map();
  for (const r of records) {
    if (r.uuid) byUuid.set(r.uuid, r);
    if (r.parentUuid) {
      if (!byParent.has(r.parentUuid)) byParent.set(r.parentUuid, []);
      byParent.get(r.parentUuid).push(r);
    }
  }

  // Find root records (no parent or parent not in this set)
  const roots = records.filter(r => !r.parentUuid || !byUuid.has(r.parentUuid));
  if (roots.length === 0) return records; // circular, bail out

  // BFS from roots
  const ordered = [];
  const visited = new Set();
  const queue = [...roots];

  while (queue.length > 0) {
    const rec = queue.shift();
    const key = rec.uuid || JSON.stringify(rec);
    if (visited.has(key)) continue;
    visited.add(key);
    ordered.push(rec);

    if (rec.uuid && byParent.has(rec.uuid)) {
      queue.push(...byParent.get(rec.uuid));
    }
  }

  // Add any unvisited records at the end
  for (const r of records) {
    const key = r.uuid || JSON.stringify(r);
    if (!visited.has(key)) ordered.push(r);
  }

  return ordered;
}
