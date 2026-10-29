import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { useCartStore } from '@/stores/cart';
import { ApiError } from '@/utils/errors';

import { burger, menu, todayOpen } from './fixtures';
import { mutationResult, queryResult, renderWithProviders } from './render';

const mockLogin = mutationResult();
const mockSubmit = mutationResult();
const mockToday = jest.fn();
const mockMenu = jest.fn();

jest.mock('@/features/auth/api', () => ({ useLogin: () => mockLogin }));
jest.mock('@/features/notifications/api', () => ({ useNotifications: () => ({ data: { unread: 0 } }) }));
jest.mock('@/features/ordering/api', () => ({
  useToday: () => mockToday(),
  useTodayMenu: () => mockMenu(),
  useSubmitOrder: () => mockSubmit,
  useUpdateOrder: () => require('./render').mutationResult(),
}));
jest.mock('@/services/api', () => ({ api: { get: jest.fn(async () => ({ data: require('./fixtures').menu })) } }));

/* eslint-disable @typescript-eslint/no-require-imports */
const LoginScreen = require('@/app/(auth)/login').default;
const Index = require('@/app/index').default;
const HomeScreen = require('@/app/(employee)/home').default;
const MenuScreen = require('@/app/(ordering)/menu').default;
const CartScreen = require('@/app/(ordering)/cart').default;
const { ItemCustomizer, useItemConfiguration } = require('@/features/ordering/components/ItemCustomizer');
const { formatMoney } = require('@/utils/money');
const { useAuthStore } = require('@/stores/auth');
/* eslint-enable @typescript-eslint/no-require-imports */

beforeEach(async () => {
  jest.clearAllMocks();
  mockToday.mockReturnValue(queryResult(todayOpen));
  mockMenu.mockReturnValue(queryResult(menu));
});

describe('Login', () => {
  it('validates required fields before calling the API', async () => {
    await renderWithProviders(<LoginScreen />);
    await fireEvent.press(screen.getByTestId('login-submit'));
    expect(await screen.findByText('Enter your username or email')).toBeTruthy();
    expect(screen.getByText('Enter your password')).toBeTruthy();
    expect(mockLogin.mutate).not.toHaveBeenCalled();
  });

  it('submits credentials', async () => {
    await renderWithProviders(<LoginScreen />);
    await fireEvent.changeText(screen.getByTestId('login-username'), 'sara.nabil');
    await fireEvent.changeText(screen.getByTestId('login-password'), 'Secret123');
    await fireEvent.press(screen.getByTestId('login-submit'));
    await waitFor(() =>
      expect(mockLogin.mutate).toHaveBeenCalledWith({ username: 'sara.nabil', password: 'Secret123' }, expect.anything()),
    );
  });
});

describe('Role-based navigation', () => {
  const user = {
    id: 'u1', full_name: 'Sara Nabil', username: 'sara', email: null, phone: null, department: null,
    role: 'EMPLOYEE', is_active: true, participates_in_orders: true, must_change_password: false,
    last_login_at: null, notification_prefs: {}, preferred_language: 'en',
  };

  it.each([
    [{ status: 'signedOut', user: null }, '/login'],
    [{ status: 'signedIn', user: { ...user, must_change_password: true } }, '/change-password'],
    [{ status: 'signedIn', user }, '/home'],
    [{ status: 'signedIn', user: { ...user, role: 'ADMIN' } }, '/dashboard'],
  ])('redirects %#', async (state, expected) => {
    await act(async () => useAuthStore.setState(state));
    await renderWithProviders(<Index />);
    expect(screen.getByTestId('redirect').props.children).toBe(expected);
  });
});

describe('Employee home', () => {
  beforeEach(async () => await act(async () => useAuthStore.setState({ status: 'signedIn', user: { full_name: 'Sara Nabil' } as never })));

  it('shows a polished empty state when no restaurant is selected', async () => {
    mockToday.mockReturnValue(queryResult({ ...todayOpen, session: null, is_accepting_orders: false, accepting_reason: 'NO_SESSION' }));
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText('No restaurant selected yet')).toBeTruthy();
  });

  it("shows today's restaurant and a browse button while ordering is open", async () => {
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Restaurant A')).toBeTruthy();
    expect(screen.getByTestId('browse-menu')).toBeTruthy();
  });

  it('summarises an existing order', async () => {
    mockToday.mockReturnValue(
      queryResult({
        ...todayOpen,
        my_order: { id: 'o1', reference: 'EMS-1029-ABCD', status: 'SUBMITTED', total_amount: '240.00', item_count: 2,
          submitted_at: todayOpen.server_time, updated_at: todayOpen.server_time },
      }),
    );
    await renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Your order')).toBeTruthy();
    expect(screen.getByText('240 EGP')).toBeTruthy();
    expect(screen.getByText('Edit order')).toBeTruthy();
  });
});

describe('Menu browsing', () => {
  it('lists categories and filters by search', async () => {
    await renderWithProviders(<MenuScreen />);
    expect(screen.getByText('Chicken Burger')).toBeTruthy();
    expect(screen.getByText('Chicken Pasta')).toBeTruthy();
    await fireEvent.changeText(screen.getByPlaceholderText('Search the menu'), 'pasta');
    expect(screen.queryByText('Chicken Burger')).toBeNull();
    expect(screen.getByText('Chicken Pasta')).toBeTruthy();
  });
});

describe('Item customization', () => {
  function Harness() {
    const state = useItemConfiguration(burger);
    return (
      <>
        <ItemCustomizer item={burger} state={state} showErrors={false} />
        <Text testID="total">{formatMoney(state.total)}</Text>
      </>
    );
  }

  it('updates the total as size, extras and quantity change', async () => {
    await renderWithProviders(<Harness />);
    expect(screen.getByTestId('total').props.children).toBe('180 EGP');
    await fireEvent.press(screen.getByText('Large'));
    await fireEvent.press(screen.getByText('Cheese'));
    expect(screen.getByTestId('total').props.children).toBe('235 EGP');
    await fireEvent.press(screen.getByLabelText('Increase quantity'));
    expect(screen.getByTestId('total').props.children).toBe('470 EGP');
  });
});

describe('Cart and submission', () => {
  beforeEach(async () => {
    await act(async () =>
      useCartStore.setState({
        sessionId: 's1',
        editingOrderId: null,
        idempotencyKey: null,
        lines: [
          { key: 'l1', menuItemId: 'burger', name: 'Chicken Burger', imageUrl: null, quantity: 1, basePrice: 18000,
            modifiers: [{ id: 'large', groupId: 'size', groupName: 'Size', name: 'Large', price: 3500 }], instructions: '' },
        ],
      }),
    );
  });

  it('submits server-validated lines with an idempotency key and the displayed total', async () => {
    await renderWithProviders(<CartScreen />);
    expect(screen.getByTestId('cart-total').props.children).toBe('215 EGP');
    await fireEvent.press(screen.getByTestId('submit-order'));
    const [payload] = mockSubmit.mutate.mock.calls[0];
    expect(payload).toMatchObject({
      sessionId: 's1',
      expectedTotal: '215.00',
      items: [{ menu_item_id: 'burger', quantity: 1, modifier_ids: ['large'], special_instructions: null }],
    });
    expect(payload.idempotencyKey).toEqual(expect.any(String));
  });

  it('re-prices the cart when the server reports a price change', async () => {
    await renderWithProviders(<CartScreen />);
    await fireEvent.press(screen.getByTestId('submit-order'));
    const [, callbacks] = mockSubmit.mutate.mock.calls[0];
    await act(async () => {
      await callbacks.onError(new ApiError('PRICE_CHANGED', 'Prices changed', 409));
    });
    expect(await screen.findByText('Some prices changed. Please review your updated total.')).toBeTruthy();
    expect(screen.getByTestId('cart-total').props.children).toBe('215 EGP');
  });
});
