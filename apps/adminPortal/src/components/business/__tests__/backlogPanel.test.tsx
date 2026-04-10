import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BacklogPanel } from '../backlogPanel';
import type { BacklogTask, BacklogSprint } from '@nodeadmin/shared-types';

// Mock react-intl
vi.mock('react-intl', () => ({
  useIntl: () => ({
    formatMessage: ({ id }: { id: string }) => id,
    locale: 'en',
  }),
}));

// Mock toast
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), toast: vi.fn() }),
}));

// Mock useApiClient
const mockGet = vi.fn();
const mockDel = vi.fn();
vi.mock('@/hooks/useApiClient', () => ({
  useApiClient: () => ({ get: mockGet, post: vi.fn(), del: mockDel, patch: vi.fn() }),
}));

// Mock dialog sub-components
vi.mock('../taskFormDialog', () => ({
  TaskFormDialog: () => <div data-testid="task-form-dialog" />,
}));
vi.mock('../sprintFormDialog', () => ({
  SprintFormDialog: () => <div data-testid="sprint-form-dialog" />,
}));
vi.mock('../assignTasksDialog', () => ({
  AssignTasksDialog: () => <div data-testid="assign-tasks-dialog" />,
}));

const mockTasks: BacklogTask[] = [
  {
    id: 'task-1',
    tenant_id: 'default',
    title: 'Setup CI pipeline',
    description: 'Configure GitHub Actions',
    status: 'todo',
    priority: 'high',
    sprint_id: null,
    assignee_id: null,
    sort_order: 0,
    created_by: null,
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
  {
    id: 'task-2',
    tenant_id: 'default',
    title: 'Write unit tests',
    description: 'Add test coverage',
    status: 'in_progress',
    priority: 'medium',
    sprint_id: 'sprint-1',
    assignee_id: 'user-1',
    sort_order: 1,
    created_by: 'user-1',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

const mockSprints: BacklogSprint[] = [
  {
    id: 'sprint-1',
    tenant_id: 'default',
    name: 'Sprint 1',
    goal: 'Initial setup',
    status: 'active',
    start_date: '2026-04-01',
    end_date: '2026-04-14',
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-01T00:00:00Z',
  },
];

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function renderPanel() {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <BacklogPanel />
    </QueryClientProvider>,
  );
}

describe('BacklogPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: tasks query
    mockGet.mockImplementation((url: string) => {
      if (url.includes('/tasks')) {
        return Promise.resolve({ items: mockTasks, total: 2 });
      }
      if (url.includes('/sprints')) {
        return Promise.resolve({ items: mockSprints, total: 1 });
      }
      if (url.includes('/users')) {
        return Promise.resolve({ items: [], total: 0 });
      }
      return Promise.resolve({ items: [], total: 0 });
    });
    mockDel.mockResolvedValue(undefined);
  });

  it('1. Renders title and description', () => {
    renderPanel();
    expect(screen.getByText('backlog.title')).toBeInTheDocument();
    expect(screen.getByText('backlog.desc')).toBeInTheDocument();
  });

  it('2. Shows tasks tab by default', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Setup CI pipeline')).toBeInTheDocument();
      expect(screen.getByText('Write unit tests')).toBeInTheDocument();
    });
  });

  it('3. Switches to sprints tab', async () => {
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Setup CI pipeline')).toBeInTheDocument();
    });

    const sprintsTab = screen.getByText('backlog.tabSprints');
    await user.click(sprintsTab);

    await waitFor(() => {
      expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    });
  });

  it('4. Search input is present', async () => {
    const user = userEvent.setup();
    renderPanel();

    const searchInput = screen.getByPlaceholderText('backlog.search');
    expect(searchInput).toBeInTheDocument();
    await user.type(searchInput, 'CI');
    expect(searchInput).toHaveValue('CI');
  });

  it('5. Shows loading state', () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    renderPanel();

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('6. Create button opens task form', async () => {
    const user = userEvent.setup();
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Setup CI pipeline')).toBeInTheDocument();
    });

    const createButton = screen.getByText('backlog.createTask');
    await user.click(createButton);

    expect(screen.getByTestId('task-form-dialog')).toBeInTheDocument();
  });

  it('7. Edit and delete buttons are present for tasks', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Setup CI pipeline')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByText('backlog.edit');
    expect(editButtons.length).toBeGreaterThanOrEqual(1);

    const deleteButtons = screen.getAllByText('backlog.delete');
    expect(deleteButtons.length).toBeGreaterThanOrEqual(1);
  });
});
