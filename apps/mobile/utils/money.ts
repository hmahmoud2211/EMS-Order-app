/**
 * Currency helpers. The API sends money as fixed-point strings ("180.00"); the app
 * converts them to integer piastres so no floating-point arithmetic touches money.
 * Totals shown before submission are previews — the server recalculates them.
 */

export type Piastres = number;

export function toPiastres(value: string | number | null | undefined): Piastres {
  if (value === null || value === undefined || value === '') return 0;
  const text = typeof value === 'number' ? value.toFixed(2) : String(value).trim();
  const negative = text.startsWith('-');
  const [intPart, fracPart = ''] = text.replace('-', '').split('.');
  const whole = parseInt(intPart || '0', 10) || 0;
  const cents = parseInt((fracPart + '00').slice(0, 2), 10) || 0;
  const result = whole * 100 + cents;
  return negative ? -result : result;
}

export function toDecimalString(piastres: Piastres): string {
  const negative = piastres < 0;
  const abs = Math.abs(Math.round(piastres));
  const text = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return negative ? `-${text}` : text;
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** "1,250 EGP" for whole amounts, "180.50 EGP" otherwise. */
export function formatMoney(piastres: Piastres, currency = 'EGP'): string {
  const negative = piastres < 0;
  const abs = Math.abs(Math.round(piastres));
  const whole = groupThousands(String(Math.floor(abs / 100)));
  const cents = abs % 100;
  const amount = cents === 0 ? whole : `${whole}.${String(cents).padStart(2, '0')}`;
  return `${negative ? '-' : ''}${amount} ${currency}`;
}

export function formatPrice(value: string | number | null | undefined, currency = 'EGP'): string {
  return formatMoney(toPiastres(value), currency);
}

/** Validates a price typed by an admin ("12", "12.5", "12.50"). */
export function isValidPriceInput(text: string): boolean {
  return /^\d{1,6}(\.\d{1,2})?$/.test(text.trim());
}
