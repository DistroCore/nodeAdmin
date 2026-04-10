import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ManagementOverviewPanel } from '../managementOverviewPanel';

const mockGet = vi.fn();

vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
  }),
}));

vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({
    get: mockGet,
  }),
}));

vi.mock('@/app/layout/navIcon', () => ({
  NavIcon: ({ name }: { name: string }) => <span data-testid={`nav-icon-${name}`}>{name}</span>,
}));

function renderPanel(): void {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ManagementOverviewPanel />
    </QueryClientProvider>,
  );
}

describe('ManagementOverviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/console/overview') {
        return Promise.resolve({
          stats: [
            { label: 'overview.stat.onlineUsers', value: '12' },
            { label: 'overview.stat.totalConversations', value: '34' },
          ],
          todos: ['Ship backlog cleanup'],
        });
      }

      if (path === '/api/v1/health') {
        return Promise.resolve({
          service: 'coreApi',
          status: 'ok',
          timestamp: '2026-04-02T00:00:00.000Z',
          version: '1.2.3',
        });
      }

      return Promise.reject(new Error(`Unexpected path: ${path}`));
    });
  });

  it('loads overview and health data', async () => {
    renderPanel();

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/console/overview');
      expect(mockGet).toHaveBeenCalledWith('/api/v1/health');
    });

    expect(await screen.findByText('overview.stat.onlineUsers')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('34')).toBeInTheDocument();
    expect(screen.getByText('Ship backlog cleanup')).toBeInTheDocument();
    expect(screen.getByText('v1.2.3')).toBeInTheDocument();
    expect(screen.getByText('coreApi / ok')).toBeInTheDocument();
  });

  it('shows the error state when overview loading fails', async () => {
    mockGet.mockImplementation((path: string) => {
      if (path === '/api/v1/console/overview') {
        return Promise.reject(new Error('overview failed'));
      }

      return Promise.resolve({
        service: 'coreApi',
        status: 'ok',
        timestamp: '2026-04-02T00:00:00.000Z',
        version: '1.2.3',
      });
    });

    renderPanel();

    expect(await screen.findByText('common.failed')).toBeInTheDocument();
    const retryButtons = screen.getAllByRole('button', { name: 'common.retry' });
    expect(retryButtons.length).toBeGreaterThanOrEqual(1);
  });
});
