import type { CartLine } from '@/stores/cart';
import type { Menu } from '@/types/api';
import { toPiastres } from '@/utils/money';

/**
 * Update cart lines with the latest menu prices after the server reports PRICE_CHANGED
 * or an unavailable item. Lines whose item (or a chosen option) disappeared are dropped.
 */
export function repriceCart(lines: CartLine[], menu: Menu): { lines: CartLine[]; removed: string[] } {
  const items = new Map(menu.categories.flatMap((c) => c.items).map((item) => [item.id, item]));
  const removed: string[] = [];
  const result: CartLine[] = [];
  for (const line of lines) {
    const item = items.get(line.menuItemId);
    if (!item || !item.is_available) {
      removed.push(line.name);
      continue;
    }
    const modifiers = item.modifier_groups.flatMap((g) => g.modifiers.map((m) => ({ ...m, groupId: g.id, groupName: g.name })));
    const byId = new Map(modifiers.map((m) => [m.id, m]));
    const updated = line.modifiers.map((m) => byId.get(m.id));
    if (updated.some((m) => !m || !m.is_available)) {
      removed.push(line.name);
      continue;
    }
    result.push({
      ...line,
      name: item.name,
      basePrice: toPiastres(item.base_price),
      modifiers: updated.map((m) => ({
        id: m!.id,
        groupId: m!.groupId,
        groupName: m!.groupName,
        name: m!.name,
        price: toPiastres(m!.additional_price),
      })),
    });
  }
  return { lines: result, removed };
}
