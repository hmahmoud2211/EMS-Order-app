import { mergeDraftItems, optionsToText, textToOptions } from '@/features/imports/draft';
import { repriceCart } from '@/features/ordering/reprice';
import { cartCount, cartTotal, lineTotal, toOrderLines, useCartStore, type CartLine } from '@/stores/cart';
import type { DraftItem } from '@/types/api';
import { defaultSelections, missingSelections, startingPrice, toggleModifier, unitPriceFor } from '@/utils/modifiers';
import { formatMoney, isValidPriceInput, toDecimalString, toPiastres } from '@/utils/money';
import { addMinutesHHMM, cairoDateTimeISO, cairoHHMM, formatDuration } from '@/utils/time';

import { burger, menu } from './fixtures';

describe('money', () => {
  it('converts decimal strings to integer piastres without floats', () => {
    expect(toPiastres('180.00')).toBe(18000);
    expect(toPiastres('0.1')).toBe(10);
    expect(toPiastres('1250.05')).toBe(125005);
    expect(toDecimalString(125005)).toBe('1250.05');
    expect(toDecimalString(toPiastres('0.1') + toPiastres('0.2'))).toBe('0.30');
  });

  it('formats amounts for display', () => {
    expect(formatMoney(284000)).toBe('2,840 EGP');
    expect(formatMoney(18050)).toBe('180.50 EGP');
  });

  it('validates admin price input', () => {
    expect(isValidPriceInput('180')).toBe(true);
    expect(isValidPriceInput('180.5')).toBe(true);
    expect(isValidPriceInput('180.555')).toBe(false);
    expect(isValidPriceInput('-1')).toBe(false);
  });
});

describe('Cairo time helpers', () => {
  it('builds a UTC instant from a Cairo wall time and back', () => {
    const iso = cairoDateTimeISO('2026-11-03', '12:00');
    expect(cairoHHMM(iso)).toBe('12:00');
    expect(iso).toBe('2026-11-03T10:00:00.000Z'); // Cairo is UTC+2 in November
  });

  it('adds minutes with wrap-around and formats durations', () => {
    expect(addMinutesHHMM('23:50', 15)).toBe('00:05');
    expect(addMinutesHHMM('00:05', -15)).toBe('23:50');
    expect(formatDuration(3720)).toBe('1h 02m');
    expect(formatDuration(95)).toBe('1m 35s');
  });
});

describe('modifier rules', () => {
  it('pre-selects required single choices and computes unit price', () => {
    const selected = defaultSelections(burger);
    expect(selected).toEqual(['regular']);
    expect(unitPriceFor(burger, ['large', 'cheese', 'sauce'])).toBe(24500);
    expect(startingPrice(burger)).toBe(18000);
  });

  it('acts as radio for single-choice groups and caps multi-choice groups', () => {
    const size = burger.modifier_groups[0];
    const extras = burger.modifier_groups[1];
    expect(toggleModifier(size, ['regular'], 'large')).toEqual(['large']);
    let selected = toggleModifier(extras, [], 'cheese');
    selected = toggleModifier(extras, selected, 'sauce');
    expect(toggleModifier(extras, selected, 'bacon')).toEqual(['cheese', 'sauce']); // max 2
    expect(toggleModifier(extras, selected, 'cheese')).toEqual(['sauce']);
  });

  it('reports missing required groups', () => {
    expect(missingSelections(burger, ['cheese']).map((m) => m.groupName)).toEqual(['Size']);
    expect(missingSelections(burger, ['regular'])).toEqual([]);
  });
});

describe('cart store', () => {
  const line: Omit<CartLine, 'key'> = {
    menuItemId: 'burger',
    name: 'Chicken Burger',
    imageUrl: null,
    quantity: 2,
    basePrice: 18000,
    modifiers: [{ id: 'large', groupId: 'size', groupName: 'Size', name: 'Large', price: 3500 }],
    instructions: 'No onions',
  };

  beforeEach(() => useCartStore.setState({ sessionId: 's1', lines: [], editingOrderId: null, idempotencyKey: null }));

  it('merges identical configurations and totals correctly', () => {
    useCartStore.getState().addLine(line);
    useCartStore.getState().addLine({ ...line, quantity: 1 });
    const { lines } = useCartStore.getState();
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3);
    expect(lineTotal(lines[0])).toBe(64500);
    useCartStore.getState().addLine({ ...line, instructions: '' });
    expect(cartCount(useCartStore.getState().lines)).toBe(5);
    expect(cartTotal(useCartStore.getState().lines)).toBe(107500);
  });

  it('keeps the idempotency key stable across retries until the cart changes', () => {
    useCartStore.getState().addLine(line);
    const first = useCartStore.getState().startSubmission();
    expect(useCartStore.getState().startSubmission()).toBe(first);
    useCartStore.getState().updateLine(useCartStore.getState().lines[0].key, { quantity: 1 });
    expect(useCartStore.getState().startSubmission()).not.toBe(first);
  });

  it('resets when the session changes and builds API payloads', () => {
    useCartStore.getState().addLine(line);
    expect(toOrderLines(useCartStore.getState().lines)).toEqual([
      { menu_item_id: 'burger', quantity: 2, modifier_ids: ['large'], special_instructions: 'No onions' },
    ]);
    useCartStore.getState().ensureSession('s2');
    expect(useCartStore.getState().lines).toEqual([]);
  });
});

describe('price changes', () => {
  it('reprices from the latest menu and drops unavailable items', () => {
    const lines: CartLine[] = [
      { key: 'a', menuItemId: 'burger', name: 'Chicken Burger', imageUrl: null, quantity: 1, basePrice: 17000,
        modifiers: [{ id: 'large', groupId: 'size', groupName: 'Size', name: 'Large', price: 3000 }], instructions: '' },
      { key: 'b', menuItemId: 'gone', name: 'Old Dish', imageUrl: null, quantity: 1, basePrice: 5000, modifiers: [], instructions: '' },
    ];
    const result = repriceCart(lines, menu);
    expect(result.removed).toEqual(['Old Dish']);
    expect(result.lines[0].basePrice).toBe(18000);
    expect(result.lines[0].modifiers[0].price).toBe(3500);
  });
});

describe('import review helpers', () => {
  it('round-trips option text', () => {
    const options = textToOptions('Regular:0 | Large:+35 | Family');
    expect(options).toEqual([
      { name: 'Regular', price: '0' },
      { name: 'Large', price: '35' },
      { name: 'Family', price: null },
    ]);
    expect(optionsToText([{ name: 'Large', price: '35.00' }])).toBe('Large:35');
  });

  it('merges duplicate rows', () => {
    const base: DraftItem = {
      id: 'a', category: 'Burgers', name: 'Burger', description: null, base_price: '100.00',
      sizes: [{ name: 'Regular', price: '0.00' }], extras: [], is_available: true, confidence: 1,
      status: 'VALID', issues: [], duplicate_of: null, source: null,
    };
    const merged = mergeDraftItems(base, {
      ...base, id: 'b', description: 'Juicy', base_price: '120.00',
      sizes: [{ name: 'Large', price: '20.00' }], issues: ['POSSIBLE_DUPLICATE'], duplicate_of: 'a',
    });
    expect(merged.base_price).toBe('100.00');
    expect(merged.description).toBe('Juicy');
    expect(merged.sizes.map((s) => s.name)).toEqual(['Regular', 'Large']);
  });
});
