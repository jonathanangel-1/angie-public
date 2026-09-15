// Operational failures must never masquerade as a lack of matching clothes.
export function classifyInspirationFailure(message: string) {
  if (/^Search budget/.test(message)) return { status: 503, code: 'search-budget-limit', error: 'Search reached its limit. Your picture is still here.' };
  if (/^No verified /.test(message)) return { status: 422, code: 'no-qualified-products', error: message };
  if (/^Retailer images/.test(message)) return { status: 503, code: 'image-evidence-unavailable', error: message };
  if (/OpenAI(?: visual match)? 429:.*(?:no credits|credits remaining|credit.balance.exhausted|insufficient.quota|billing quota|current quota)/i.test(message)) {
    return { status: 503, code: 'service-credits-exhausted', error: 'Search is paused. Service credits need topping up.' };
  }
  if (/^OPENAI_API_KEY is unavailable|^OpenAI(?: visual match)? (401|403):/.test(message)) {
    return { status: 503, code: 'service-configuration', error: 'Search is temporarily unavailable. Your inspiration is unchanged.' };
  }
  if (/^OpenAI(?: visual match)? 429:/.test(message)) return { status: 503, code: 'service-busy', error: 'Search is busy. Try again shortly.' };
  if (/timeout|timed out/i.test(message)) return { status: 504, code: 'service-timeout', error: 'Search took too long. Try again.' };
  return { status: 502, code: 'upstream-or-storage-failure', error: 'Search could not finish. Try again.' };
}
