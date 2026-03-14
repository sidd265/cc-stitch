import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { basename } from 'path';

/**
 * Parse a JSONL session file into normalized records.
 * Uses an async generator to keep memory usage low.
 * @param {string} filePath - Path to the .jsonl file
 * @param {object} [options]
 * @param {boolean} [options.includeProgress=false] - Include progress/result records
 * @param {boolean} [options.full=false] - Include full tool call inputs/outputs
 * @yields {Record}
 */
export async function* parseSessionFile(filePath, options = {}) {
  const { includeProgress = false, full = false } = options;
  const fileSessionId = basename(filePath, '.jsonl');
  let errorCount = 0;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let raw;
    try {
      raw = JSON.parse(line);
    } catch {
      errorCount++;
      continue;
    }

    const record = normalizeRecord(raw, fileSessionId, { includeProgress, full });
    if (record) {
      yield record;
    }
  }

  if (errorCount > 0) {
    yield { type: '_parseError', errorCount, filePath };
  }
}

/**
 * Normalize a raw JSONL record into a standardized shape.
 */
function normalizeRecord(raw, fileSessionId, options) {
  const { includeProgress, full } = options;

  // Skip file-history-snapshot records entirely
  if (raw.type === 'file-history-snapshot') return null;

  // Skip summary/compact records
  if (raw.isCompactSummary || raw.type === 'compact_boundary') return null;

  // Skip progress unless requested
  if (raw.type === 'progress' && !includeProgress) return null;

  // Common fields
  const base = {
    uuid: raw.uuid,
    parentUuid: raw.parentUuid,
    sessionId: raw.sessionId || fileSessionId,
    fileSessionId,
    timestamp: raw.timestamp,
    isSidechain: raw.isSidechain || false,
  };

  if (raw.type === 'user') {
    return {
      ...base,
      type: 'user',
      content: extractUserContent(raw.message),
      cwd: raw.cwd,
    };
  }

  if (raw.type === 'assistant') {
    const msg = raw.message || {};
    const content = msg.content || [];
    const textBlocks = [];
    const toolCalls = [];

    for (const block of content) {
      if (block.type === 'text') {
        textBlocks.push(block.text);
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          name: block.name,
          id: block.id,
          input: full ? block.input : truncateToolInput(block.input),
        });
      }
    }

    return {
      ...base,
      type: 'assistant',
      content: textBlocks.join('\n'),
      toolCalls,
      usage: msg.usage || raw.usage || null,
      model: msg.model || raw.model || null,
      stopReason: msg.stop_reason || null,
    };
  }

  if (raw.type === 'tool_result') {
    if (!includeProgress) return null;
    return {
      ...base,
      type: 'tool_result',
      toolId: raw.tool_use_id,
      content: full ? extractToolResultContent(raw.content) : truncateString(extractToolResultContent(raw.content), 500),
    };
  }

  if (raw.type === 'progress') {
    return {
      ...base,
      type: 'progress',
      content: raw.content || '',
    };
  }

  // For any other type, return a generic record
  return {
    ...base,
    type: raw.type || 'unknown',
    content: typeof raw.message === 'string' ? raw.message : JSON.stringify(raw.message || ''),
  };
}

function extractUserContent(message) {
  if (!message) return '';
  if (typeof message === 'string') return message;
  if (typeof message.content === 'string') return message.content;
  if (Array.isArray(message.content)) {
    return message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  // Handle the case where message itself is an array
  if (Array.isArray(message)) {
    return message
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return String(message);
}

function extractToolResultContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');
  }
  return JSON.stringify(content);
}

function truncateToolInput(input) {
  if (!input) return input;
  const str = typeof input === 'string' ? input : JSON.stringify(input);
  if (str.length <= 200) return input;
  return typeof input === 'string'
    ? str.slice(0, 200) + '...'
    : JSON.parse(JSON.stringify(input, (_, v) =>
        typeof v === 'string' && v.length > 200 ? v.slice(0, 200) + '...' : v
      ));
}

function truncateString(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen) + '...';
}
