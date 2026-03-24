import chalk from 'chalk';
import { formatTokens, formatCost, formatDuration, formatDate } from './utils/format.js';

// ── Theme ──────────────────────────────────────────────────────
const t = {
  border:   (s) => chalk.hex('#4A5568')(s),
  accent:   (s) => chalk.hex('#63B3ED')(s),
  bright:   (s) => chalk.hex('#E2E8F0')(s),
  dim:      (s) => chalk.hex('#718096')(s),
  label:    (s) => chalk.hex('#A0AEC0')(s),
  value:    (s) => chalk.bold.hex('#F7FAFC')(s),
  heading:  (s) => chalk.bold.hex('#63B3ED')(s),
  bar:      (s) => chalk.hex('#4299E1')(s),
  barTrack: (s) => chalk.hex('#2D3748')(s),
  success:  (s) => chalk.hex('#68D391')(s),
  warn:     (s) => chalk.hex('#F6AD55')(s),
  cost:     (s) => chalk.hex('#FC8181')(s),
};

// ── Box Drawing ────────────────────────────────────────────────
const B = {
  tl: '┌', tr: '┐', bl: '└', br: '┘',
  h: '─', v: '│',
  lt: '├', rt: '┤', hd: '╌',
};

/**
 * Render an analytics dashboard to the terminal.
 */
export function renderDashboard(projectName, analytics) {
  const W = Math.min(process.stdout.columns || 80, 96);
  const IW = W - 2; // inner width between left and right border chars
  const out = [];

  const hLine = (l, r) => t.border(`${l}${B.h.repeat(IW)}${r}`);
  const row = (content) => t.border(B.v) + padRight(content, IW) + t.border(B.v);
  const dotRow = () => row(' ' + t.border(B.hd.repeat(IW - 2)) + ' ');

  // ── Header ─────────────────────────────────────────────────
  out.push('');
  out.push(hLine(B.tl, B.tr));
  out.push(row(centerText('claude-stitch', IW, t.heading)));
  out.push(row(centerText(truncPath(projectName, IW - 4), IW, t.bright)));
  out.push(hLine(B.lt, B.rt));

  // ── Overview Panel ─────────────────────────────────────────
  out.push(row(sectionTitle('OVERVIEW', IW)));
  out.push(dotRow());

  const half = Math.floor((IW - 2) / 2);
  const overviewPairs = [
    ['Sessions',  String(analytics.sessionCount),                      'From',   formatDate(analytics.timeRange.start)],
    ['Messages',  `${analytics.messageCount} (${analytics.userMessageCount}u / ${analytics.assistantMessageCount}a)`, 'To', formatDate(analytics.timeRange.end)],
    ['Duration',  formatDuration(analytics.duration),                   'Models', analytics.models.map(m => shortModel(m)).join(', ') || 'Unknown'],
  ];

  for (const [lk, lv, rk, rv] of overviewPairs) {
    const leftStr = ` ${t.label(lk + ':')} ${t.value(lv)}`;
    const rightStr = `${t.label(rk + ':')} ${t.value(rv)}`;
    const leftVis = visLen(leftStr);
    const rightVis = visLen(rightStr);
    const gap = Math.max(1, IW - leftVis - rightVis - 1);
    out.push(t.border(B.v) + leftStr + ' '.repeat(gap) + rightStr + ' '.repeat(Math.max(0, IW - leftVis - gap - rightVis)) + t.border(B.v));
  }

  // ── Token Breakdown ────────────────────────────────────────
  out.push(hLine(B.lt, B.rt));
  out.push(row(sectionTitle('TOKENS', IW)));
  out.push(dotRow());

  const tokenTotal = analytics.tokens.total || 1;
  const tokenEntries = [
    { label: 'Input',       value: analytics.tokens.input,      color: t.success },
    { label: 'Output',      value: analytics.tokens.output,     color: t.warn },
    { label: 'Cache Write', value: analytics.tokens.cacheWrite, color: t.accent },
    { label: 'Cache Read',  value: analytics.tokens.cacheRead,  color: t.bar },
  ].filter(e => e.value > 0);

  const labelW = 14;
  const valW = 9;
  const pctW = 5;
  const barW = IW - labelW - valW - pctW - 4; // 4 for spacing

  for (const entry of tokenEntries) {
    const pct = entry.value / tokenTotal;
    const filled = Math.max(1, Math.round(pct * barW));
    const empty = barW - filled;
    const bar = entry.color('\u2588'.repeat(filled)) + t.barTrack('\u2591'.repeat(empty));
    const pctStr = t.dim(`${(pct * 100).toFixed(0)}%`.padStart(pctW));
    const valStr = t.value(formatTokens(entry.value).padStart(valW));
    const lbl = t.label(entry.label.padEnd(labelW));
    const line = ` ${lbl}${bar} ${valStr}${pctStr}`;
    out.push(row(line));
  }

  out.push(dotRow());
  const totalStr = ` ${t.label('Total'.padEnd(labelW))}${' '.repeat(barW)} ${t.value(formatTokens(analytics.tokens.total).padStart(valW))}`;
  out.push(row(totalStr));

  // ── Cost ───────────────────────────────────────────────────
  out.push(hLine(B.lt, B.rt));
  const costStr = ` ${t.dim('COST')}`;
  const costVal = t.cost(chalk.bold(formatCost(analytics.cost)));
  const costValLen = visLen(costVal);
  const costGap = IW - visLen(costStr) - costValLen - 1;
  out.push(t.border(B.v) + costStr + ' '.repeat(Math.max(1, costGap)) + costVal + ' ' + t.border(B.v));

  // ── Top Files ──────────────────────────────────────────────
  if (analytics.topFiles.length > 0) {
    out.push(hLine(B.lt, B.rt));
    out.push(row(sectionTitle('FILES MODIFIED', IW)));
    out.push(dotRow());

    const maxFileCount = Math.max(...analytics.topFiles.map(f => f.count));
    const fileBarW = Math.min(20, Math.floor(IW / 4));
    const cntW = 5;
    const filePathW = IW - fileBarW - cntW - 5;
    const displayed = analytics.topFiles.slice(0, 8);

    for (const f of displayed) {
      const ratio = f.count / maxFileCount;
      const filled = Math.max(1, Math.round(ratio * fileBarW));
      const empty = fileBarW - filled;
      const bar = t.accent('\u2593'.repeat(filled)) + t.barTrack('\u2591'.repeat(empty));
      const cnt = t.dim(String(f.count).padStart(cntW - 1) + 'x');
      const fp = t.bright(truncPath(f.path, filePathW));
      out.push(row(` ${cnt} ${bar} ${fp}`));
    }
    if (analytics.topFiles.length > 8) {
      out.push(row(t.dim(`  ... and ${analytics.topFiles.length - 8} more files`)));
    }
  }

  // ── Tool Usage ─────────────────────────────────────────────
  if (analytics.topTools.length > 0) {
    out.push(hLine(B.lt, B.rt));
    out.push(row(sectionTitle('TOOL USAGE', IW)));
    out.push(dotRow());

    const maxToolCount = Math.max(...analytics.topTools.map(x => x.count));
    const toolBarW = Math.min(25, Math.floor(IW / 3));
    const displayedTools = analytics.topTools.slice(0, 6);

    for (const tool of displayedTools) {
      const ratio = tool.count / maxToolCount;
      const filled = Math.max(1, Math.round(ratio * toolBarW));
      const empty = toolBarW - filled;
      const bar = t.bar('\u2588'.repeat(filled)) + t.barTrack('\u2591'.repeat(empty));
      const cnt = t.value(String(tool.count).padStart(5));
      const name = t.label(tool.name);
      out.push(row(` ${cnt} ${bar} ${name}`));
    }
  }

  // ── Footer ─────────────────────────────────────────────────
  out.push(hLine(B.bl, B.br));
  out.push('');

  console.log(out.join('\n'));
}

// ── Helpers ──────────────────────────────────────────────────

function stripAnsi(str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

function visLen(str) {
  return stripAnsi(str).length;
}

function padRight(content, width) {
  const vis = visLen(content);
  const pad = Math.max(0, width - vis);
  return content + ' '.repeat(pad);
}

function centerText(text, width, styleFn = (s) => s) {
  const len = text.length;
  const padL = Math.max(0, Math.floor((width - len) / 2));
  const padR = Math.max(0, width - len - padL);
  return ' '.repeat(padL) + styleFn(text) + ' '.repeat(padR);
}

function sectionTitle(title, width) {
  return ' ' + t.dim(title) + ' '.repeat(Math.max(0, width - title.length - 1));
}

function shortModel(modelId) {
  if (!modelId) return '?';
  if (modelId.includes('opus'))   return 'Opus';
  if (modelId.includes('sonnet')) return 'Sonnet';
  if (modelId.includes('haiku'))  return 'Haiku';
  return modelId.split('-').slice(0, 3).join('-');
}

function truncPath(p, max) {
  if (!p || p.length <= max) return p || '';
  const parts = p.replace(/\\/g, '/').split('/');
  const file = parts.pop();
  if (file.length >= max - 4) return '...' + file.slice(-(max - 3));
  let result = file;
  for (let i = parts.length - 1; i >= 0; i--) {
    const candidate = parts[i] + '/' + result;
    if (candidate.length + 4 > max) break;
    result = candidate;
  }
  return result === file && parts.length > 0 ? '.../' + result : result;
}
