import type { MenuItem, ModifierGroup } from '@/types/api';
import { toPiastres, type Piastres } from '@/utils/money';

/** Minimum number of selections a group needs (required groups need at least one). */
export function minimumFor(group: ModifierGroup): number {
  return Math.max(group.minimum_selections, group.is_required ? 1 : 0);
}

/** Radio behaviour for single-choice groups, checkbox behaviour (capped at max) otherwise. */
export function toggleModifier(group: ModifierGroup, selected: string[], modifierId: string): string[] {
  const groupIds = new Set(group.modifiers.map((m) => m.id));
  const inGroup = selected.filter((id) => groupIds.has(id));
  const others = selected.filter((id) => !groupIds.has(id));
  if (group.maximum_selections === 1) {
    if (inGroup.includes(modifierId) && minimumFor(group) === 0) return others;
    return [...others, modifierId];
  }
  if (inGroup.includes(modifierId)) return [...others, ...inGroup.filter((id) => id !== modifierId)];
  if (inGroup.length >= group.maximum_selections) return selected;
  return [...others, ...inGroup, modifierId];
}

/** Pre-select the first available option of required single-choice groups (e.g. "Regular"). */
export function defaultSelections(item: MenuItem): string[] {
  const selected: string[] = [];
  for (const group of item.modifier_groups) {
    if (group.maximum_selections === 1 && minimumFor(group) === 1) {
      const first = group.modifiers.find((m) => m.is_available);
      if (first) selected.push(first.id);
    }
  }
  return selected;
}

export interface GroupProblem {
  groupId: string;
  groupName: string;
  minimum: number;
}

export function missingSelections(item: MenuItem, selected: string[]): GroupProblem[] {
  const chosen = new Set(selected);
  return item.modifier_groups
    .filter((group) => group.modifiers.filter((m) => chosen.has(m.id)).length < minimumFor(group))
    .map((group) => ({ groupId: group.id, groupName: group.name, minimum: minimumFor(group) }));
}

export function selectedModifiers(item: MenuItem, selected: string[]) {
  const chosen = new Set(selected);
  return item.modifier_groups.flatMap((group) =>
    group.modifiers
      .filter((m) => chosen.has(m.id))
      .map((m) => ({ id: m.id, groupId: group.id, groupName: group.name, name: m.name, price: toPiastres(m.additional_price) })),
  );
}

export function unitPriceFor(item: MenuItem, selected: string[]): Piastres {
  return toPiastres(item.base_price) + selectedModifiers(item, selected).reduce((sum, m) => sum + m.price, 0);
}

/** Lowest possible price, used for "from 180 EGP" labels. */
export function startingPrice(item: MenuItem): Piastres {
  let price = toPiastres(item.base_price);
  for (const group of item.modifier_groups) {
    const min = minimumFor(group);
    if (min > 0) {
      const cheapest = group.modifiers
        .filter((m) => m.is_available)
        .map((m) => toPiastres(m.additional_price))
        .sort((a, b) => a - b)
        .slice(0, min);
      price += cheapest.reduce((sum, p) => sum + p, 0);
    }
  }
  return price;
}
