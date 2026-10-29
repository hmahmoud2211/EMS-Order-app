import type { DraftItem, DraftOption } from '@/types/api';
import { randomId } from '@/utils/id';
import { isValidPriceInput } from '@/utils/money';

/** "Regular:0|Large:35" ⇄ [{name, price}] — compact editing format for sizes and extras. */
export function optionsToText(options: DraftOption[]): string {
  return options.map((o) => `${o.name}:${o.price === null ? '' : o.price.replace(/\.00$/, '')}`).join(' | ');
}

export function textToOptions(text: string): DraftOption[] {
  return text
    .split('|')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const index = part.lastIndexOf(':');
      if (index === -1) return { name: part, price: null };
      const name = part.slice(0, index).trim();
      const price = part.slice(index + 1).trim().replace(/^\+/, '');
      return { name: name || part, price: isValidPriceInput(price) ? price : null };
    });
}

export function blankDraftItem(category = 'Menu'): DraftItem {
  return {
    id: `manual-${randomId().slice(0, 8)}`,
    category,
    name: '',
    description: null,
    base_price: null,
    sizes: [],
    extras: [],
    is_available: true,
    confidence: 1,
    status: 'INVALID',
    issues: ['MISSING_NAME', 'MISSING_PRICE'],
    duplicate_of: null,
    source: null,
  };
}

/** Merge `source` into `target`: keep target values, fill gaps, combine sizes/extras. */
export function mergeDraftItems(target: DraftItem, source: DraftItem): DraftItem {
  const mergeOptions = (a: DraftOption[], b: DraftOption[]) => {
    const names = new Set(a.map((o) => o.name.toLowerCase()));
    return [...a, ...b.filter((o) => !names.has(o.name.toLowerCase()))];
  };
  return {
    ...target,
    description: target.description || source.description,
    base_price: target.base_price ?? source.base_price,
    sizes: mergeOptions(target.sizes, source.sizes),
    extras: mergeOptions(target.extras, source.extras),
    issues: target.issues.filter((i) => i !== 'POSSIBLE_DUPLICATE'),
    duplicate_of: null,
  };
}
