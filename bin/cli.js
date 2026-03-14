#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { select } from '@inquirer/prompts';
import { writeFile } from 'fs/promises';
import { join, resolve, basename } from 'path';
import { discoverProjects } from '../src/discovery.js';
import { stitchSessions } from '../src/stitcher.js';
import { computeAnalytics } from '../src/analytics.js';
import { renderDashboard } from '../src/dashboard.js';
import { exportMarkdown } from '../src/exporters/markdown.js';
import { exportDocx } from '../src/exporters/docx.js';
import { exportPdf } from '../src/exporters/pdf.js';
import { formatSize, formatDate } from '../src/utils/format.js';

const program = new Command();
program.enablePositionalOptions();

program
  .name('cc-stitch')
  .description('Stitch Claude Code session logs into documents with analytics')
  .version('0.1.0')
  .option('-p, --path <path>', 'Path to a specific project directory or Claude projects root')
  .option('-f, --format <format>', 'Output format: docx, pdf, md, all', 'docx')
  .option('-o, --output <path>', 'Output file path (auto-generated if omitted)')
  .option('--compact', 'Only include user prompts and Claude text responses')
  .option('--full', 'Include full tool call inputs/outputs (not truncated)')
  .option('--grep <keyword>', 'Filter messages containing keyword')
  .option('--since <date>', 'Include sessions after this date (YYYY-MM-DD)')
  .option('--until <date>', 'Include sessions before this date (YYYY-MM-DD)')
  .option('--sessions <ids>', 'Only export specific session IDs (comma-separated)')
  .option('--summarize', 'Add AI-generated summary (requires @anthropic-ai/sdk)')
  .option('--no-dashboard', 'Skip terminal dashboard display')
  .action(async (opts) => {
    try {
      await runStitch(opts);
    } catch (err) {
      console.error(chalk.red(`\nError: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('list')
  .description('List discovered Claude Code projects')
  .option('-p, --path <path>', 'Path to Claude projects root')
  .action(async (opts) => {
    try {
      await runList(opts);
    } catch (err) {
      console.error(chalk.red(`\nError: ${err.message}`));
      process.exit(1);
    }
  });

program
  .command('dashboard')
  .description('Show analytics dashboard for a project')
  .option('-p, --path <path>', 'Path to a specific project directory')
  .action(async (opts) => {
    try {
      await runDashboardCmd(opts);
    } catch (err) {
      console.error(chalk.red(`\nError: ${err.message}`));
      process.exit(1);
    }
  });

program.parse();

async function runList(opts) {
  const spinner = ora('Discovering projects...').start();
  const projects = await discoverProjects(opts.path);
  spinner.stop();

  if (projects.length === 0) {
    console.log(chalk.yellow('No Claude Code projects found.'));
    return;
  }

  console.log(chalk.bold(`\n  Found ${projects.length} projects:\n`));

  for (const p of projects) {
    const lastSession = p.sessions[p.sessions.length - 1];
    console.log(`  ${chalk.cyan(p.name)}`);
    console.log(`    Path:     ${chalk.dim(p.decodedPath)}`);
    console.log(`    Sessions: ${p.sessions.length}    Size: ${formatSize(p.totalSize)}`);
    if (lastSession?.timestamp) {
      console.log(`    Last:     ${formatDate(lastSession.timestamp)}`);
    }
    console.log('');
  }
}

async function runStitch(opts) {
  let project;

  if (opts.path) {
    // Check if path is a specific project dir (contains .jsonl files)
    project = await resolveProject(opts.path);
  } else {
    // Interactive mode
    project = await interactiveProjectPicker();
  }

  if (!project) return;

  // Parse filter options
  const filterOpts = {
    compact: opts.compact || false,
    grep: opts.grep,
    since: opts.since,
    until: opts.until,
    sessionIds: opts.sessions ? opts.sessions.split(',') : undefined,
    full: opts.full || false,
  };

  // Stitch
  const spinner = ora('Stitching sessions...').start();
  const { sessions, errors } = await stitchSessions(project.sessions, filterOpts);
  spinner.succeed(`Stitched ${sessions.length} sessions (${sessions.reduce((a, s) => a + s.records.length, 0)} messages)`);

  if (errors > 0) {
    console.log(chalk.yellow(`  ⚠ ${errors} malformed lines skipped`));
  }

  if (sessions.length === 0) {
    console.log(chalk.yellow('No sessions matched the filters.'));
    return;
  }

  // Analytics
  const analytics = computeAnalytics(sessions);

  // Dashboard
  if (opts.dashboard !== false) {
    renderDashboard(project.name, analytics);
  }

  // AI Summary
  let summary;
  if (opts.summarize) {
    const sumSpinner = ora('Generating AI summary...').start();
    try {
      const { generateSummary } = await import('../src/summarizer.js');
      summary = await generateSummary(sessions);
      sumSpinner.succeed('Summary generated');
    } catch (err) {
      sumSpinner.fail(`Summary failed: ${err.message}`);
    }
  }

  // Export
  const formats = opts.format === 'all' ? ['docx', 'pdf', 'md'] : [opts.format];

  for (const format of formats) {
    const outputPath = opts.output || generateOutputPath(project.name, format);
    const exportSpinner = ora(`Exporting ${format.toUpperCase()}...`).start();

    try {
      switch (format) {
        case 'md':
        case 'markdown': {
          const md = exportMarkdown(project.name, sessions, analytics, { summary });
          await writeFile(outputPath.replace(/\.\w+$/, '.md'), md, 'utf8');
          exportSpinner.succeed(`Markdown → ${outputPath.replace(/\.\w+$/, '.md')}`);
          break;
        }
        case 'docx': {
          await exportDocx(outputPath.replace(/\.\w+$/, '.docx'), project.name, sessions, analytics, { summary });
          exportSpinner.succeed(`DOCX → ${outputPath.replace(/\.\w+$/, '.docx')}`);
          break;
        }
        case 'pdf': {
          await exportPdf(outputPath.replace(/\.\w+$/, '.pdf'), project.name, sessions, analytics, { summary });
          exportSpinner.succeed(`PDF → ${outputPath.replace(/\.\w+$/, '.pdf')}`);
          break;
        }
        default:
          exportSpinner.fail(`Unknown format: ${format}`);
      }
    } catch (err) {
      exportSpinner.fail(`Export failed: ${err.message}`);
    }
  }
}

async function runDashboardCmd(opts) {
  let project;
  if (opts.path) {
    project = await resolveProject(opts.path);
  } else {
    project = await interactiveProjectPicker();
  }
  if (!project) return;

  const spinner = ora('Analyzing sessions...').start();
  const { sessions } = await stitchSessions(project.sessions);
  const analytics = computeAnalytics(sessions);
  spinner.stop();

  renderDashboard(project.name, analytics);
}

async function resolveProject(inputPath) {
  const absPath = resolve(inputPath);

  // First: check if path itself contains .jsonl files (it's a project dir)
  try {
    const fg = (await import('fast-glob')).default;
    const { stat: fsStat } = await import('fs/promises');
    const jsonlFiles = await fg('*.jsonl', { cwd: absPath, absolute: true, deep: 1 });
    if (jsonlFiles.length > 0) {
      const sessions = [];
      let totalSize = 0;
      for (const filePath of jsonlFiles) {
        const fileStat = await fsStat(filePath);
        totalSize += fileStat.size;
        sessions.push({ filePath, size: fileStat.size });
      }
      // Read first line of first session for metadata
      const { createReadStream } = await import('fs');
      const { createInterface } = await import('readline');
      for (const s of sessions) {
        const firstLine = await new Promise(res => {
          const rl = createInterface({ input: createReadStream(s.filePath, { encoding: 'utf8' }), crlfDelay: Infinity });
          rl.on('line', l => { rl.close(); res(l); });
          rl.on('error', () => res(null));
          rl.on('close', () => res(null));
        });
        if (firstLine) {
          try {
            const rec = JSON.parse(firstLine);
            s.sessionId = rec.sessionId;
            s.timestamp = rec.timestamp;
            s.cwd = rec.cwd;
          } catch {}
        }
      }
      sessions.sort((a, b) => {
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(a.timestamp) - new Date(b.timestamp);
      });
      const canonicalPath = sessions[0]?.cwd || absPath;
      return {
        name: basename(canonicalPath) || basename(absPath),
        folderName: basename(absPath),
        path: absPath,
        decodedPath: canonicalPath,
        sessions,
        totalSize,
      };
    }
  } catch { /* fallback */ }

  // Try as a Claude projects root (parent of project dirs)
  const projects = await discoverProjects(absPath);
  if (projects.length > 0) {
    if (projects.length === 1) return projects[0];
    return await pickFromList(projects);
  }

  // Try looking up by the decoded path matching
  const allProjects = await discoverProjects();
  const match = allProjects.find(p =>
    p.decodedPath === absPath || p.path === absPath || p.folderName === basename(absPath)
  );
  if (match) return match;

  console.log(chalk.yellow(`No sessions found at: ${absPath}`));
  return null;
}

async function interactiveProjectPicker() {
  const spinner = ora('Discovering projects...').start();
  const projects = await discoverProjects();
  spinner.stop();

  if (projects.length === 0) {
    console.log(chalk.yellow('No Claude Code projects found.'));
    return null;
  }

  return await pickFromList(projects);
}

async function pickFromList(projects) {
  const choice = await select({
    message: 'Select a project:',
    choices: projects.map(p => ({
      name: `${p.name} (${p.sessions.length} sessions, ${formatSize(p.totalSize)})`,
      value: p,
      description: p.decodedPath,
    })),
    pageSize: 15,
  });

  return choice;
}

function generateOutputPath(projectName, format) {
  const safeName = projectName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const ext = format === 'markdown' ? 'md' : format;
  return join(process.cwd(), `${safeName}_sessions.${ext}`);
}
