import { readdir, stat, readFile } from 'fs/promises';
import { join } from 'path';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import fg from 'fast-glob';
import { getClaudeProjectsDir, decodeFolderName, getProjectDisplayName } from './utils/paths.js';

/**
 * Discover all Claude Code projects and their sessions.
 * @param {string} [customPath] - Override the default projects directory
 * @returns {Promise<Array<{name, path, decodedPath, sessions, totalSize}>>}
 */
export async function discoverProjects(customPath) {
  const projectsDir = customPath || getClaudeProjectsDir();

  let entries;
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  const projects = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const projectDir = join(projectsDir, entry.name);
    const jsonlFiles = await fg('*.jsonl', {
      cwd: projectDir,
      absolute: true,
      deep: 1,
    });

    if (jsonlFiles.length === 0) continue;

    const sessions = [];
    let totalSize = 0;

    for (const filePath of jsonlFiles) {
      const fileStat = await stat(filePath);
      totalSize += fileStat.size;

      const firstLine = await readFirstLine(filePath);
      let sessionInfo = { filePath, size: fileStat.size };

      if (firstLine) {
        try {
          const record = JSON.parse(firstLine);
          sessionInfo.sessionId = record.sessionId;
          sessionInfo.timestamp = record.timestamp;
          sessionInfo.cwd = record.cwd;
        } catch {
          // Malformed first line — still include the session
        }
      }

      sessions.push(sessionInfo);
    }

    // Sort sessions by timestamp (oldest first)
    sessions.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(a.timestamp) - new Date(b.timestamp);
    });

    // Use cwd from first session as canonical path if available
    const canonicalPath = sessions[0]?.cwd || decodeFolderName(entry.name);
    const displayName = getProjectDisplayName(canonicalPath);

    projects.push({
      name: displayName,
      folderName: entry.name,
      path: projectDir,
      decodedPath: canonicalPath,
      sessions,
      totalSize,
    });
  }

  // Sort projects by most recent session first
  projects.sort((a, b) => {
    const aLast = a.sessions[a.sessions.length - 1]?.timestamp;
    const bLast = b.sessions[b.sessions.length - 1]?.timestamp;
    if (!aLast) return 1;
    if (!bLast) return -1;
    return new Date(bLast) - new Date(aLast);
  });

  return projects;
}

/**
 * Read the first line of a file efficiently.
 */
async function readFirstLine(filePath) {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });
    rl.on('line', (line) => {
      rl.close();
      resolve(line);
    });
    rl.on('error', () => resolve(null));
    rl.on('close', () => resolve(null));
  });
}
