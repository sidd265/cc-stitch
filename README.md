# cc-stitch

Stitch Claude Code session logs into documents with analytics.

Discovers all your Claude Code sessions from `~/.claude/projects/`, stitches them chronologically, and exports to **DOCX**, **PDF**, or **Markdown** -- with a terminal analytics dashboard showing tokens, cost, files modified, and tool usage.

## Install

```bash
npm install -g cc-stitch
```

## Usage

```bash
# Interactive mode -- pick a project and export
cc-stitch

# List all discovered projects
cc-stitch list

# Export a specific project to Markdown
cc-stitch --path ~/.claude/projects/my-project --format md

# Export all formats at once
cc-stitch --path ~/.claude/projects/my-project --format all

# Show analytics dashboard only
cc-stitch dashboard --path ~/.claude/projects/my-project

# Compact export (user prompts + Claude text only, no tool calls)
cc-stitch --path ~/.claude/projects/my-project --format md --compact

# Filter messages by keyword
cc-stitch --path ~/.claude/projects/my-project --format md --grep "database"

# Filter by date range
cc-stitch --path ~/.claude/projects/my-project --since 2025-01-01 --until 2025-02-01

# Include full tool call inputs/outputs (not truncated)
cc-stitch --path ~/.claude/projects/my-project --format md --full

# Add AI-generated summary (requires @anthropic-ai/sdk + ANTHROPIC_API_KEY)
cc-stitch --path ~/.claude/projects/my-project --format docx --summarize

# Skip the terminal dashboard
cc-stitch --path ~/.claude/projects/my-project --format md --no-dashboard

# Custom output path
cc-stitch --path ~/.claude/projects/my-project --format docx -o report.docx
```

## Commands

| Command | Description |
|---------|-------------|
| `cc-stitch` | Interactive project picker + export |
| `cc-stitch list` | List all discovered Claude Code projects |
| `cc-stitch dashboard` | Show analytics dashboard for a project |

## Options

| Flag | Description |
|------|-------------|
| `-p, --path <path>` | Path to a Claude project directory |
| `-f, --format <fmt>` | Output format: `docx` (default), `pdf`, `md`, `all` |
| `-o, --output <path>` | Custom output file path |
| `--compact` | User prompts + Claude text only |
| `--full` | Include full tool call inputs/outputs |
| `--grep <keyword>` | Filter messages containing keyword |
| `--since <date>` | Include sessions after date (YYYY-MM-DD) |
| `--until <date>` | Include sessions before date (YYYY-MM-DD) |
| `--sessions <ids>` | Export specific session IDs (comma-separated) |
| `--summarize` | AI summary (needs `@anthropic-ai/sdk`) |
| `--no-dashboard` | Skip terminal dashboard |

## Dashboard

The terminal dashboard shows:

- Session count, message count, total duration
- Token breakdown with proportional bar charts (input, output, cache)
- Estimated cost based on model pricing
- Top modified files with edit counts
- Tool usage frequency

## AI Summary (optional)

Install the Anthropic SDK and set your API key:

```bash
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=your-key
cc-stitch --path ~/.claude/projects/my-project --summarize
```

## Output Formats

- **DOCX** -- Cover page, overview table, session chapters with turn numbering, tool calls in monospace code blocks
- **PDF** -- A4 pages with word-wrapped content, page numbers, structured headings
- **Markdown** -- YAML metadata block, overview table, files modified table, session chapters with timestamps and token usage per turn

All formats include structured metadata for AI readability.

## License

MIT
