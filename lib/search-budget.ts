// Standard API rates checked 2026-09-07 against official model/pricing pages.
// Estimates are an application guard, not an account-wide billing guarantee.
const rates: Record<string, [number, number, number]> = {
  'gpt-5.4-2026-03-05': [2.5, 0.25, 15],
  'gpt-5.4-mini-2026-03-17': [0.75, 0.075, 4.5],
  'text-embedding-3-small': [0.02, 0.02, 0],
};
type UsageRow = { stage: string; model: string; status: number; input: number; cached: number; output: number; searches: number; estimatedUsd: number; uncertain: boolean; cacheHit?: boolean };
type ApiResult = { status?: string; data?: unknown; output?: Array<{ type?: string }>; usage?: { input_tokens?: number; prompt_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } } };
type Cache = { get(key: string): Promise<{ createdAt: number; body: unknown } | null>; put(key: string, value: { createdAt: number; body: unknown }): Promise<void> };
export type BudgetOptions = { maxUsd?: number; maxCalls?: number; cache?: Cache; transport?: typeof fetch; onUsage?: (row: UsageRow) => void };
export class SearchBudget {
  readonly rows: UsageRow[] = [];
  private reserved = 0;
  private calls = 0;
  constructor(private options: BudgetOptions = {}) {}
  snapshot() { return { calls: this.calls, cacheHits: this.rows.filter(row => row.cacheHit).length, estimatedUsd: this.rows.reduce((sum, row) => sum + row.estimatedUsd, 0), reservedUsd: this.reserved, maxUsd: this.options.maxUsd ?? 2, maxCalls: this.options.maxCalls ?? 12, rows: this.rows }; }
  fetch(stage: string): typeof fetch {
    return async (url, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      const rate = rates[body.model];
      if (!rate) throw new Error('Search budget: unpriced model blocked.');
      const tools = body.tools?.length ? Number(body.max_tool_calls || 0) : 0;
      if (body.tools?.length && (!tools || tools > 4)) throw new Error('Search budget: tool calls must be bounded.');
      let images = 0;
      const text = JSON.stringify(body, (key, value) => { if (key === 'image_url') { images++; return '[image]'; } return value; });
      // Deliberately pessimistic: one token per UTF-8 byte, 16K per image,
      // all allowed output tokens, and a full mini context per web-search turn.
      // Reserve synchronously before the network request so parallel slots
      // cannot each spend the same remaining allowance.
      const upperInput = new TextEncoder().encode(text).length + images * 16384 + tools * 400000;
      // Match settlement: mini does not have the flagship long-context surcharge.
      const long = body.model === 'gpt-5.4-2026-03-05' && upperInput > 272000;
      const reserve = (upperInput * rate[0] * (long ? 2 : 1)
        + Number(body.max_output_tokens || 0) * rate[2] * (long ? 1.5 : 1)) / 1e6 + tools * 0.01;
      let key = '';
      if (this.options.cache) {
        key = 'visual-v7-' + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(init?.body))))].map(x => x.toString(16).padStart(2, '0')).join('');
        const cached = await this.options.cache.get(key).catch(() => null);
        if (cached && Date.now() - cached.createdAt < (tools ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000)) {
          const row: UsageRow = { stage, model: body.model, status: 200, input: 0, cached: 0, output: 0, searches: 0, estimatedUsd: 0, uncertain: false, cacheHit: true };
          this.rows.push(row); this.options.onUsage?.(row);
          return Response.json(cached.body);
        }
      }
      const snapshot = this.snapshot();
      if (this.calls >= snapshot.maxCalls || snapshot.estimatedUsd + this.reserved + reserve > snapshot.maxUsd) throw new Error('Search budget: request limit reached.');
      this.calls++; this.reserved += reserve;
      let row: UsageRow = { stage, model: body.model, status: 0, input: 0, cached: 0, output: 0, searches: 0, estimatedUsd: reserve, uncertain: true };
      try {
        const response = await (this.options.transport || fetch)(url, init);
        const result = await response.clone().json().catch(() => ({})) as ApiResult;
        const usage = result.usage;
        if (usage) {
          const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0), cached = Number(usage.input_tokens_details?.cached_tokens ?? 0), output = Number(usage.output_tokens ?? 0);
          const searches = (result.output || []).filter((part: { type?: string }) => part.type === 'web_search_call').length;
          const long = body.model === 'gpt-5.4-2026-03-05' && input > 272000;
          row = { stage, model: body.model, status: response.status, input, cached, output, searches,
            estimatedUsd: ((input - cached) * rate[0] * (long ? 2 : 1) + cached * rate[1] * (long ? 2 : 1) + output * rate[2] * (long ? 1.5 : 1)) / 1e6 + searches * 0.01, uncertain: false };
        } else row.status = response.status;
        if (key && response.ok && result.status !== 'incomplete' && (result.output || result.data)) await this.options.cache?.put(key, { createdAt: Date.now(), body: result }).catch(() => undefined);
        return response;
      } finally { this.reserved -= reserve; this.rows.push(row); this.options.onUsage?.(row); }
    };
  }
}
