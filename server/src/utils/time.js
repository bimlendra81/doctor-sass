const UNIT_MS = { s: 1000, m: 60000, h: 3600000, d: 86400000 };

export function ttlToMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const [, amount, unit] = match;
  return Number(amount) * UNIT_MS[unit];
}
