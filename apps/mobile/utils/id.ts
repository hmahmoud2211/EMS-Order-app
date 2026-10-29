/** Random identifier for idempotency keys and client-side list keys (not security-sensitive). */
export function randomId(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  const hex = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < 32; i += 1) {
    out += hex[Math.floor(Math.random() * 16)];
    if (i === 7 || i === 11 || i === 15 || i === 19) out += '-';
  }
  return out;
}

export function initials(name: string): string {
  // Only words that start with a letter count ("EMS Admin (Demo)" → "EA").
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => /^\p{L}/u.test(part));
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}
