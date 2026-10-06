export function formatUnits(value: bigint | number | string, decimals = 6) {
  let n = typeof value === 'bigint' ? value : BigInt(value || 0);
  const negative = n < 0n;
  if (negative) n = -n;
  const base = 10n ** BigInt(decimals);
  const whole = n / base;
  const frac = (n % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  const text = frac ? `${whole}.${frac}` : whole.toString();
  return negative ? `-${text}` : text;
}
