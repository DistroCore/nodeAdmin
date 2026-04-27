import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReleaseControlPanel } from '../releaseControlPanel';

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }, values?: Record<string, unknown>) => {
      if (values) {
        return `${id}:${JSON.stringify(values)}`;
      }
      return id;
    },
    locale: 'en',
  }),
}));

// Mock useApiClient
const mockGet = vi.fn();
vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({ get: mockGet, post: vi.fn(), del: vi.fn(), patch: vi.fn() }),
}));

const mockReleaseChecks = {
  checks: [
    { done: true, title: 'Database (PostgreSQL) configured' },
    { done: true, title: 'Redis configured' },
    { done: false, title: 'Kafka configured' },
    { done: true, title: 'JWT secrets configured' },
    { done: false, title: 'CORS origins configured' },
  ],
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ReleaseControlPanel />
    </QueryClientProvider>,
  );
}

describe('ReleaseControlPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockReleaseChecks);
  });

  it('1. Renders title and description', () => {
    renderPanel();
    expect(screen.getByText('release.title')).toBeInTheDocument();
    expect(screen.getByText('release.desc')).toBeInTheDocument();
  });

  it('2. Loads and displays release checks', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Database (PostgreSQL) configured')).toBeInTheDocument();
    });
    expect(screen.getByText('Redis configured')).toBeInTheDocument();
    expect(screen.getByText('Kafka configured')).toBeInTheDocument();
  });

  it('3. Shows pass/fail badges correctly', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Database (PostgreSQL) configured')).toBeInTheDocument();
    });

    const passBadges = screen.getAllByText('release.pass');
    expect(passBadges.length).toBe(3); // 3 done

    const failBadges = screen.getAllByText('release.fail');
    expect(failBadges.length).toBe(2); // 2 not done
  });

  it('4. Shows completion percentage', async () => {
    renderPanel();

    await waitFor(() => {
      // 3/5 = 60%
      expect(screen.getByText('60%')).toBeInTheDocument();
    });
  });

  it('5. Shows loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPanel();

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('6. Shows error state when fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('release.loadFailed')).toBeInTheDocument();
    });
    expect(screen.getByText('common.retry')).toBeInTheDocument();
  });

  it('7. Retry button refetches data', async () => {
    mockGet.mockRejectedValueOnce(new Error('Network error'));
    mockGet.mockResolvedValue(mockReleaseChecks);
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('release.loadFailed')).toBeInTheDocument();
    });

    await user.click(screen.getByText('common.retry'));

    await waitFor(() => {
      expect(screen.getByText('Database (PostgreSQL) configured')).toBeInTheDocument();
    });
  });

  it('8. Run Checks button is present', async () => {
    renderPanel();

    // Wait for data to finish loading so button returns to idle state
    await waitFor(() => {
      expect(screen.getByText('release.runChecks')).toBeInTheDocument();
    });
  });
});
