import { act, fireEvent, screen } from '@testing-library/react-native';

import { dashboard } from './fixtures';
import { mutationResult, queryResult, renderWithProviders } from './render';

const mockStatus = jest.fn();
const mockRestaurants = jest.fn();

jest.mock('@/features/notifications/api', () => ({ useNotifications: () => ({ data: { unread: 2 } }) }));
jest.mock('@/features/admin/api', () => ({
  useDashboard: () => require('./render').queryResult(require('./fixtures').dashboard),
  useSessionAction: () => require('./render').mutationResult(),
  useEmployeeStatus: (...args: unknown[]) => mockStatus(...args),
}));
jest.mock('@/features/restaurants/api', () => ({ useRestaurants: () => mockRestaurants() }));

/* eslint-disable @typescript-eslint/no-require-imports */
const Dashboard = require('@/app/(admin)/(tabs)/dashboard').default;
const Orders = require('@/app/(admin)/(tabs)/orders').default;
const { RestaurantPicker } = require('@/features/admin/components/RestaurantPicker');
const { useAuthStore } = require('@/stores/auth');
/* eslint-enable @typescript-eslint/no-require-imports */

const rows = [
  { employee_id: 'u1', full_name: 'Employee A', department: 'IT', status: 'ORDERED', order_id: 'o1', order_reference: 'R1',
    submitted_at: dashboard.server_time, updated_at: dashboard.server_time, total_amount: '240.00', item_count: 2 },
  { employee_id: 'u3', full_name: 'Employee C', department: 'IT', status: 'NOT_ORDERED', order_id: null, order_reference: null,
    submitted_at: null, updated_at: null, total_amount: null, item_count: 0 },
];

beforeEach(async () => {
  jest.clearAllMocks();
  await act(async () => useAuthStore.setState({ status: 'signedIn', user: { role: 'ADMIN', participates_in_orders: false } as never }));
  mockStatus.mockImplementation((_id: string, filter: string) =>
    queryResult({
      session_id: 's1',
      counts: { all: 18, ordered: 2, not_ordered: 16 },
      rows: rows.filter((r) => filter === 'all' || (filter === 'ordered' ? r.status === 'ORDERED' : r.status === 'NOT_ORDERED')),
    }),
  );
});

describe('Admin dashboard', () => {
  it('shows live participation metrics and totals', async () => {
    await renderWithProviders(<Dashboard />);
    expect(screen.getByTestId('dashboard-restaurant').props.children).toBe('Restaurant A');
    expect(screen.getByLabelText('Employees: 18')).toBeTruthy();
    expect(screen.getByLabelText('Ordered: 2')).toBeTruthy();
    expect(screen.getByLabelText('Not ordered: 16')).toBeTruthy();
    expect(screen.getByLabelText('Total value: 425 EGP')).toBeTruthy();
    expect(screen.getByText('Employee C')).toBeTruthy(); // still waiting
  });
});

describe('Employee status filtering', () => {
  it('switches between ordered and not-ordered employees', async () => {
    await renderWithProviders(<Orders />);
    expect(screen.getByText('Employee A')).toBeTruthy();
    expect(screen.getByText('Employee C')).toBeTruthy();
    await fireEvent.press(screen.getByRole('tab', { name: /Not ordered/ }));
    expect(mockStatus).toHaveBeenLastCalledWith('s1', 'not_ordered', '');
    expect(screen.queryByText('Employee A')).toBeNull();
    expect(screen.getByText('Employee C')).toBeTruthy();
  });
});

describe('Restaurant selection', () => {
  it('selects a restaurant and disables ones without a menu', async () => {
    mockRestaurants.mockReturnValue(
      queryResult({
        items: [
          { id: 'r1', name: 'Restaurant A', cuisine: 'Burgers', branch: null, item_count: 12, last_selected_on: null,
            cover_image_url: null },
          { id: 'r2', name: 'Empty Place', cuisine: null, branch: null, item_count: 0, last_selected_on: null,
            cover_image_url: null },
        ],
        total: 2,
        limit: 200,
        offset: 0,
      }),
    );
    const onChange = jest.fn();
    await renderWithProviders(<RestaurantPicker value={null} onChange={onChange} />);
    await fireEvent.press(screen.getByText('Restaurant A'));
    expect(onChange).toHaveBeenCalledWith('r1');
    await fireEvent.press(screen.getByText('Empty Place'));
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
