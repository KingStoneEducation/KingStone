/**
 * Money is always an integer number of minor units (1 G = 100 minor units).
 * Never store or settle fractional amounts; use the helpers below.
 */
export type Money = number;

export const MINOR_PER_G = 100;

/** Convert a G amount (may have up to 2 decimals) into integer minor units. */
export function G(amount: number): Money {
  return Math.round(amount * MINOR_PER_G);
}

export function toG(m: Money): number {
  return m / MINOR_PER_G;
}

export function isMoney(m: unknown): m is Money {
  return typeof m === 'number' && Number.isSafeInteger(m);
}

export function assertMoney(m: unknown, label = 'amount'): asserts m is Money {
  if (!isMoney(m)) throw new Error(`${label} must be an integer amount of minor units, got ${String(m)}`);
}

/** Multiply by a rational (num/den), rounding toward zero. Used for payouts and commissions. */
export function mulRatio(m: Money, num: number, den: number): Money {
  assertMoney(m);
  if (!Number.isInteger(num) || !Number.isInteger(den) || den === 0) throw new Error('mulRatio: bad ratio');
  const product = m * num;
  if (!Number.isSafeInteger(product)) throw new Error('mulRatio: overflow');
  return Math.trunc(product / den);
}

/** Basis-point percentage (1% = 100 bp), rounded toward zero. */
export function percentBp(m: Money, bp: number): Money {
  return mulRatio(m, Math.round(bp), 10000);
}

export function formatG(m: Money, opts: { sign?: boolean; compact?: boolean; decimals?: boolean } = {}): string {
  const neg = m < 0;
  const abs = Math.abs(m);
  const whole = Math.floor(abs / MINOR_PER_G);
  const frac = abs % MINOR_PER_G;
  let body: string;
  if (opts.compact && whole >= 10000) {
    if (whole >= 1_000_000_000) body = (whole / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '') + 'B';
    else if (whole >= 1_000_000) body = (whole / 1_000_000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    else body = (whole / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  } else {
    body = whole.toLocaleString('en-US');
    if (frac !== 0 || opts.decimals) body += '.' + String(frac).padStart(2, '0');
  }
  const sign = neg ? '-' : opts.sign && m > 0 ? '+' : '';
  return `${sign}${body} G`;
}

/** Splits an amount into chip denominations (greedy, denominations in minor units, descending). */
export function breakIntoChips(amount: Money, denoms: readonly Money[]): Money[] {
  const out: Money[] = [];
  let rest = amount;
  for (const d of denoms) {
    while (rest >= d) {
      out.push(d);
      rest -= d;
    }
  }
  return out;
}
