/**
 * Generate an AI summary of the session content using Claude.
 * Requires @anthropic-ai/sdk to be installed and ANTHROPIC_API_KEY set.
 * @param {Array<StitchedSession>} sessions
 * @returns {Promise<string>}
 */
export async function generateSummary(sessions) {
  let Anthropic;
  try {
    const sdk = await import('@anthropic-ai/sdk');
    Anthropic = sdk.default || sdk.Anthropic;
  } catch {
    throw new Error(
      'The --summarize flag requires @anthropic-ai/sdk.\n' +
      'Install it with: npm install @anthropic-ai/sdk\n' +
      'And set ANTHROPIC_API_KEY in your environment.'
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for --summarize.\n' +
      'Set it with: export ANTHROPIC_API_KEY=your-key'
    );
  }

  const client = new Anthropic();

  // Extract text-only content, chunking if needed
  const lines = [];
  for (const session of sessions) {
    for (const record of session.records) {
      if (record.type === 'user') {
        lines.push(`USER: ${record.content}`);
      } else if (record.type === 'assistant' && record.content) {
        lines.push(`ASSISTANT: ${record.content}`);
      }
    }
  }

  // Limit to ~100K chars to stay within context
  let transcript = lines.join('\n\n');
  if (transcript.length > 100_000) {
    transcript = transcript.slice(0, 100_000) + '\n\n[... truncated for length]';
  }

  const response = await client.messages.create({
    model: 'claude-sonnet-4-5-20250514',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Analyze this Claude Code session transcript and provide a structured summary:

## Goals
What was the user trying to accomplish?

## Key Decisions
What important design/implementation choices were made?

## Files Changed
What files were created or modified?

## Outcome
What was the final result?

---

${transcript}`,
    }],
  });

  return response.content[0]?.text || 'Summary generation failed.';
}
