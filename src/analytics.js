import { calculateCost } from './utils/pricing.js';

/**
 * Compute analytics from stitched sessions.
 * @param {Array<StitchedSession>} sessions
 * @returns {AnalyticsResult}
 */
export function computeAnalytics(sessions) {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCost = 0;
  let messageCount = 0;
  let userMessageCount = 0;
  let assistantMessageCount = 0;
  const modelsUsed = new Set();
  const filesModified = new Map(); // filePath → count
  const toolUsage = new Map(); // toolName → count
  let earliestTime = null;
  let latestTime = null;

  for (const session of sessions) {
    for (const record of session.records) {
      messageCount++;

      if (record.type === 'user') {
        userMessageCount++;
      }

      if (record.type === 'assistant') {
        assistantMessageCount++;

        if (record.model) modelsUsed.add(record.model);

        if (record.usage) {
          const u = record.usage;
          totalInputTokens += u.input_tokens || 0;
          totalOutputTokens += u.output_tokens || 0;
          totalCacheWriteTokens += u.cache_creation_input_tokens || 0;
          totalCacheReadTokens += u.cache_read_input_tokens || 0;
          totalCost += calculateCost(u, record.model);
        }

        // Track tool usage and file modifications
        if (record.toolCalls) {
          for (const tc of record.toolCalls) {
            toolUsage.set(tc.name, (toolUsage.get(tc.name) || 0) + 1);

            // Extract modified files from Write/Edit/MultiEdit tool calls
            if (['Write', 'Edit', 'MultiEdit'].includes(tc.name) && tc.input) {
              const filePath = tc.input.file_path || tc.input.filePath;
              if (filePath) {
                filesModified.set(filePath, (filesModified.get(filePath) || 0) + 1);
              }
            }
          }
        }
      }

      // Track time range
      if (record.timestamp) {
        const ts = new Date(record.timestamp);
        if (!earliestTime || ts < earliestTime) earliestTime = ts;
        if (!latestTime || ts > latestTime) latestTime = ts;
      }
    }
  }

  // Session durations
  const sessionDurations = sessions.map(s => {
    if (!s.startTime || !s.endTime) return 0;
    return new Date(s.endTime) - new Date(s.startTime);
  });
  const totalDuration = sessionDurations.reduce((a, b) => a + b, 0);

  // Top modified files
  const topFiles = [...filesModified.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([path, count]) => ({ path, count }));

  // Tool usage sorted
  const topTools = [...toolUsage.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }));

  return {
    sessionCount: sessions.length,
    messageCount,
    userMessageCount,
    assistantMessageCount,
    tokens: {
      input: totalInputTokens,
      output: totalOutputTokens,
      cacheWrite: totalCacheWriteTokens,
      cacheRead: totalCacheReadTokens,
      total: totalInputTokens + totalOutputTokens + totalCacheWriteTokens + totalCacheReadTokens,
    },
    cost: totalCost,
    duration: totalDuration,
    timeRange: {
      start: earliestTime,
      end: latestTime,
    },
    models: [...modelsUsed],
    topFiles,
    topTools,
  };
}
