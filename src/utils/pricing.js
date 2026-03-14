// Pricing per million tokens (USD)
const MODEL_PRICING = {
  'claude-opus-4-6': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-opus-4-20250514': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
  'claude-sonnet-4-6': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-sonnet-4-5-20250514': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-haiku-4-5-20251001': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  'claude-3-5-sonnet-20241022': { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 },
  'claude-3-opus-20240229': { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 },
};

// Fallback pricing (use sonnet pricing as default)
const DEFAULT_PRICING = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };

/**
 * Get pricing for a given model ID.
 * Tries exact match first, then prefix match.
 */
export function getModelPricing(modelId) {
  if (!modelId) return DEFAULT_PRICING;

  // Exact match
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];

  // Prefix match
  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (modelId.startsWith(key) || key.startsWith(modelId)) {
      return pricing;
    }
  }

  // Keyword fallback
  const lower = modelId.toLowerCase();
  if (lower.includes('opus')) return MODEL_PRICING['claude-opus-4-6'];
  if (lower.includes('haiku')) return MODEL_PRICING['claude-haiku-4-5-20251001'];

  return DEFAULT_PRICING;
}

/**
 * Calculate cost for a usage record.
 */
export function calculateCost(usage, modelId) {
  if (!usage) return 0;
  const pricing = getModelPricing(modelId);
  const perMil = 1_000_000;
  let cost = 0;
  if (usage.input_tokens) cost += (usage.input_tokens / perMil) * pricing.input;
  if (usage.output_tokens) cost += (usage.output_tokens / perMil) * pricing.output;
  if (usage.cache_creation_input_tokens) cost += (usage.cache_creation_input_tokens / perMil) * pricing.cacheWrite;
  if (usage.cache_read_input_tokens) cost += (usage.cache_read_input_tokens / perMil) * pricing.cacheRead;
  return cost;
}
