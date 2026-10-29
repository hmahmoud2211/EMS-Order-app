import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { MenuItem, Order, OrderLineInput } from '@/types/api';
import { randomId } from '@/utils/id';
import { toPiastres, type Piastres } from '@/utils/money';

export interface CartModifier {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  price: Piastres;
}

export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  basePrice: Piastres;
  modifiers: CartModifier[];
  instructions: string;
}

interface CartState {
  sessionId: string | null;
  lines: CartLine[];
  /** When editing an existing order, its id; otherwise null (new submission). */
  editingOrderId: string | null;
  /** Reused across network retries so a resubmission can never create a second order. */
  idempotencyKey: string | null;
  ensureSession: (sessionId: string) => void;
  addLine: (line: Omit<CartLine, 'key'>) => void;
  updateLine: (key: string, patch: Partial<Omit<CartLine, 'key'>>) => void;
  removeLine: (key: string) => void;
  loadOrder: (order: Order, menuItems: MenuItem[]) => void;
  startSubmission: () => string;
  clear: () => void;
}

export function unitPrice(line: Pick<CartLine, 'basePrice' | 'modifiers'>): Piastres {
  return line.basePrice + line.modifiers.reduce((sum, m) => sum + m.price, 0);
}

export function lineTotal(line: CartLine): Piastres {
  return unitPrice(line) * line.quantity;
}

export function cartTotal(lines: CartLine[]): Piastres {
  return lines.reduce((sum, line) => sum + lineTotal(line), 0);
}

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function toOrderLines(lines: CartLine[]): OrderLineInput[] {
  return lines.map((line) => ({
    menu_item_id: line.menuItemId,
    quantity: line.quantity,
    modifier_ids: line.modifiers.map((m) => m.id),
    special_instructions: line.instructions.trim() || null,
  }));
}

function sameConfiguration(a: Omit<CartLine, 'key'>, b: CartLine): boolean {
  const ids = (mods: CartModifier[]) => mods.map((m) => m.id).sort().join(',');
  return a.menuItemId === b.menuItemId && ids(a.modifiers) === ids(b.modifiers) && a.instructions.trim() === b.instructions.trim();
}

const empty = { sessionId: null, lines: [], editingOrderId: null, idempotencyKey: null };

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      ...empty,
      ensureSession: (sessionId) => {
        if (get().sessionId !== sessionId) set({ ...empty, sessionId });
      },
      addLine: (line) =>
        set((state) => {
          const existing = state.lines.find((l) => sameConfiguration(line, l));
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.key === existing.key ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
              ),
              idempotencyKey: null,
            };
          }
          return { lines: [...state.lines, { ...line, key: randomId() }], idempotencyKey: null };
        }),
      updateLine: (key, patch) =>
        set((state) => ({
          lines: state.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)),
          idempotencyKey: null,
        })),
      removeLine: (key) =>
        set((state) => ({ lines: state.lines.filter((l) => l.key !== key), idempotencyKey: null })),
      loadOrder: (order, menuItems) => {
        const byId = new Map(menuItems.map((item) => [item.id, item]));
        const lines: CartLine[] = order.items
          .filter((item) => item.menu_item_id)
          .map((item) => ({
            key: randomId(),
            menuItemId: item.menu_item_id!,
            name: item.item_name_snapshot,
            imageUrl: byId.get(item.menu_item_id!)?.image_url ?? null,
            quantity: item.quantity,
            basePrice: toPiastres(item.base_price_snapshot),
            modifiers: item.selected_modifiers_snapshot
              .filter((m) => m.modifier_id)
              .map((m) => ({
                id: m.modifier_id!,
                groupId: m.group_id ?? '',
                groupName: m.group_name,
                name: m.name,
                price: toPiastres(m.price),
              })),
            instructions: item.special_instructions ?? '',
          }));
        set({ sessionId: order.session.id, lines, editingOrderId: order.id, idempotencyKey: null });
      },
      startSubmission: () => {
        const key = get().idempotencyKey ?? randomId();
        set({ idempotencyKey: key });
        return key;
      },
      clear: () => set({ lines: [], editingOrderId: null, idempotencyKey: null }),
    }),
    {
      name: 'ems-food-cart',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        sessionId: state.sessionId,
        lines: state.lines,
        editingOrderId: state.editingOrderId,
        idempotencyKey: state.idempotencyKey,
      }),
    },
  ),
);
