import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SystemMetricsPanel } from '../systemMetricsPanel';

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock useApiClient
const mockGet = vi.fn();
vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({ get: mockGet, post: vi.fn(), del: vi.fn(), patch: vi.fn() }),
}));

const mockMetricsResponse = {
  cpu: { system: 5000000, user: 10000000 },
  memory: { external: 2048000, heapTotal: 67108864, heapUsed: 33554432, rss: 104857600 },
  eventLoopLagMs: 2.5,
  uptime: 86400,
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <SystemMetricsPanel />
    </QueryClientProvider>,
  );
}

describe('SystemMetricsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockMetricsResponse);
  });

  it('1. Renders title and description', () => {
    renderPanel();
    expect(screen.getByText('metrics.title')).toBeInTheDocument();
    expect(screen.getByText('metrics.desc')).toBeInTheDocument();
  });

  it('2. Calls correct API endpoint', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/metrics');
    });
  });

  it('3. Shows loading state while fetching', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPanel();

    // Component shows '...' for loading values
    const loadingDots = screen.getAllByText('...');
    expect(loadingDots.length).toBeGreaterThan(0);
  });

  it('4. Shows error state on fetch failure', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('metrics.loadFailed')).toBeInTheDocument();
    });
  });

  it('5. Displays CPU time after loading', async () => {
    renderPanel();

    // cpuTotal = 5M + 10M = 15M, / 1M = 15.00s
    await waitFor(() => {
      expect(screen.getByText('15.00s')).toBeInTheDocument();
    });
  });

  it('6. Displays event loop lag', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('2.50 ms')).toBeInTheDocument();
    });
  });

  it('7. Displays uptime', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('86400')).toBeInTheDocument();
    });
  });

  it('8. Displays memory values in MB', async () => {
    renderPanel();

    // heapUsed = 33554432 / 1024 / 1024 = 32.00 MB (appears multiple times)
    await waitFor(() => {
      const heapUsedLabels = screen.getAllByText('32.00 MB');
      expect(heapUsedLabels.length).toBeGreaterThanOrEqual(1);
    });
    // heapTotal = 64.00 MB
    expect(screen.getAllByText('64.00 MB').length).toBeGreaterThanOrEqual(1);
    // rss = 100.00 MB
    expect(screen.getAllByText('100.00 MB').length).toBeGreaterThanOrEqual(1);
  });

  it('9. Shows retry button in error state', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('common.retry')).toBeInTheDocument();
    });
  });

  it('10. Renders metric section labels', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('metrics.cpu')).toBeInTheDocument();
    });
    expect(screen.getByText('metrics.eventLoop')).toBeInTheDocument();
    expect(screen.getAllByText('metrics.heapUsed').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('metrics.uptime')).toBeInTheDocument();
  });
});
