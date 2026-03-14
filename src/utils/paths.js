import { homedir } from 'os';
import { join, sep } from 'path';

/**
 * Get the Claude Code projects directory path.
 */
export function getClaudeProjectsDir() {
  return join(homedir(), '.claude', 'projects');
}

/**
 * Decode a Claude Code folder name back to a readable path.
 * Claude encodes project paths as folder names by replacing path separators.
 * e.g. "-Users-john-myproject" → "/Users/john/myproject" (macOS/Linux)
 *      "C-Users-john-myproject" → "C:\Users\john\myproject" (Windows)
 */
export function decodeFolderName(folderName) {
  // Windows drive letter pattern: starts with a single letter followed by dash
  const windowsDriveMatch = folderName.match(/^([A-Za-z])-(.*)$/);
  if (windowsDriveMatch) {
    const drive = windowsDriveMatch[1].toUpperCase();
    const rest = windowsDriveMatch[2].replace(/-/g, sep);
    return `${drive}:${sep}${rest}`;
  }

  // Unix-style: leading dash = leading /
  if (folderName.startsWith('-')) {
    return folderName.replace(/-/g, '/');
  }

  return folderName.replace(/-/g, sep);
}

/**
 * Extract a short display name from a project path.
 */
export function getProjectDisplayName(projectPath) {
  if (!projectPath) return 'Unknown';
  const parts = projectPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || projectPath;
}
