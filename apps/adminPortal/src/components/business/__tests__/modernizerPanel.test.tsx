import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ModernizerPanel } from '../modernizerPanel';

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

const mockAnalysisResult = {
  issues: [
    {
      file: 'src/utils/logger.ts',
      line: 42,
      category: 'console-log',
      message: 'Unexpected console statement',
      severity: 'warning',
    },
    {
      file: 'src/api/users.ts',
      line: 15,
      category: 'missing-validation',
      message: 'Missing input validation',
      severity: 'error',
    },
    {
      file: 'src/components/app.tsx',
      line: 8,
      category: 'unused-import',
      message: 'Unused import: lodash',
      severity: 'info',
    },
  ],
  summary: {
    total: 3,
    byCategory: {
      'console-log': 1,
      'missing-validation': 1,
      'unused-import': 1,
    },
  },
};

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <ModernizerPanel />
    </QueryClientProvider>,
  );
}

describe('ModernizerPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue(mockAnalysisResult);
  });

  it('1. Renders title and description', () => {
    renderPanel();
    expect(screen.getByText('modernizer.title')).toBeInTheDocument();
    expect(screen.getByText('modernizer.desc')).toBeInTheDocument();
  });

  it('2. Shows click-to-run message before analysis', () => {
    renderPanel();
    expect(screen.getByText('modernizer.clickToRun')).toBeInTheDocument();
  });

  it('3. Run Analysis button triggers analysis', async () => {
    const user = userEvent.setup();
    renderPanel();

    const runButton = screen.getByText('modernizer.runAnalysis');
    await user.click(runButton);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/api/v1/modernizer/analyze');
    });
  });

  it('4. Displays analysis results after running', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('modernizer.runAnalysis'));

    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument(); // total issues
    });

    // Summary card shows total
    expect(screen.getByText('modernizer.totalIssues')).toBeInTheDocument();
  });

  it('5. Displays issue details in table', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('modernizer.runAnalysis'));

    await waitFor(() => {
      expect(screen.getByText('Unexpected console statement')).toBeInTheDocument();
    });
    expect(screen.getByText('Missing input validation')).toBeInTheDocument();
    expect(screen.getByText('Unused import: lodash')).toBeInTheDocument();
  });

  it('6. Shows severity badges', async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('modernizer.runAnalysis'));

    await waitFor(() => {
      const warningBadge = screen.getByText('warning');
      expect(warningBadge).toBeInTheDocument();
    });
    expect(screen.getByText('error')).toBeInTheDocument();
    expect(screen.getByText('info')).toBeInTheDocument();
  });

  it('7. Shows error state when analysis fails', async () => {
    mockGet.mockRejectedValue(new Error('Network error'));
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByText('modernizer.runAnalysis'));

    await waitFor(() => {
      expect(screen.getByText('modernizer.loadFailed')).toBeInTheDocument();
    });
  });
});
