import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export async function renderWithProviders(ui: React.ReactElement) {
  // gcTime: Infinity avoids lingering garbage-collection timers after tests finish.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={metrics}>{ui}</SafeAreaProvider>
    </QueryClientProvider>,
  );
}

/** Minimal shape of a TanStack Query result for mocked hooks. */
export function queryResult<T>(data: T, extra: Record<string, unknown> = {}) {
  return {
    data,
    isLoading: false,
    isError: false,
    isRefetching: false,
    isFetching: false,
    error: null,
    refetch: jest.fn(async () => ({ data })),
    ...extra,
  };
}

export function mutationResult(extra: Record<string, unknown> = {}) {
  return { mutate: jest.fn(), mutateAsync: jest.fn(), isPending: false, isError: false, error: null, ...extra };
}
