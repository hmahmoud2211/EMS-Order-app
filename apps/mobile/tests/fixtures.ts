import type { DashboardResponse, Menu, MenuItem, Session, TodayResponse } from '@/types/api';

export const burger: MenuItem = {
  id: 'burger',
  category_id: 'cat-burgers',
  name: 'Chicken Burger',
  description: 'Crispy chicken',
  image_url: null,
  base_price: '180.00',
  currency: 'EGP',
  is_available: true,
  display_order: 0,
  modifier_groups: [
    {
      id: 'size',
      name: 'Size',
      minimum_selections: 1,
      maximum_selections: 1,
      is_required: true,
      display_order: 0,
      modifiers: [
        { id: 'regular', name: 'Regular', additional_price: '0.00', is_available: true, display_order: 0 },
        { id: 'large', name: 'Large', additional_price: '35.00', is_available: true, display_order: 1 },
      ],
    },
    {
      id: 'extras',
      name: 'Extras',
      minimum_selections: 0,
      maximum_selections: 2,
      is_required: false,
      display_order: 1,
      modifiers: [
        { id: 'cheese', name: 'Cheese', additional_price: '20.00', is_available: true, display_order: 0 },
        { id: 'sauce', name: 'Sauce', additional_price: '10.00', is_available: true, display_order: 1 },
        { id: 'bacon', name: 'Bacon', additional_price: '30.00', is_available: true, display_order: 2 },
      ],
    },
  ],
};

export const pasta: MenuItem = {
  ...burger,
  id: 'pasta',
  category_id: 'cat-mains',
  name: 'Chicken Pasta',
  description: 'Creamy white sauce',
  base_price: '185.00',
  modifier_groups: [],
};

export const menu: Menu = {
  restaurant: {
    id: 'r1',
    name: 'Restaurant A',
    branch: 'Main',
    cuisine: 'Burgers',
    description: null,
    phone: null,
    address: null,
    logo_url: null,
    cover_image_url: null,
  },
  categories: [
    { id: 'cat-burgers', name: 'Burgers', display_order: 0, items: [burger] },
    { id: 'cat-mains', name: 'Mains', display_order: 1, items: [pasta] },
  ],
  item_count: 2,
};

export const session: Session = {
  id: 's1',
  session_date: '2026-10-29',
  restaurant_id: 'r1',
  restaurant: menu.restaurant,
  opens_at: '2026-10-29T07:00:00Z',
  closes_at: '2099-10-29T10:00:00Z',
  status: 'OPEN',
  notes: null,
  delivery_fee: '0.00',
  service_fee: '0.00',
  fee_note: null,
  fee_allocation: 'NONE',
  opened_at: '2026-10-29T07:00:00Z',
  closed_at: null,
  finalized_at: null,
  cancelled_at: null,
  cancel_reason: null,
  created_at: '2026-10-29T06:00:00Z',
  updated_at: '2026-10-29T06:00:00Z',
};

export const todayOpen: TodayResponse = {
  server_time: '2026-10-29T08:00:00Z',
  business_date: '2026-10-29',
  session,
  is_accepting_orders: true,
  accepting_reason: null,
  can_cancel_order: false,
  my_order: null,
};

export const dashboard: DashboardResponse = {
  server_time: '2026-10-29T08:00:00Z',
  business_date: '2026-10-29',
  session,
  metrics: {
    total_employees: 18,
    ordered: 2,
    not_ordered: 16,
    total_items: 3,
    total_value: '425.00',
    participation_pct: 11.1,
  },
  recent_orders: [
    { order_id: 'o1', employee_name: 'Employee A', total_amount: '240.00', item_count: 2, updated_at: '2026-10-29T08:00:00Z' },
  ],
  not_ordered: [{ id: 'u3', full_name: 'Employee C', department: 'IT' }],
  seconds_until_close: 3600,
};
