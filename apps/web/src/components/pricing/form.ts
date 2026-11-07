/** Currency and percent fields both have two decimal places (cents / bps). */
export function parsePricingDecimal(value: string): number | null {
  const match = /^(\d{1,11})(?:[.,](\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const result = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}
