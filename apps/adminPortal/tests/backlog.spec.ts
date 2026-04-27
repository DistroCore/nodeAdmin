import { expect, test } from '@playwright/test';
import { login } from './helpers';

test.describe('Backlog Management', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/backlog');
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });
  });

  // ─── Tab Switching ─────────────────────────────────────────────

  test('switches between Tasks and Sprints tabs', async ({ page }) => {
    // Default is Tasks tab — verify "New Task" button is visible
    await expect(page.getByRole('main').getByRole('button', { name: 'New Task' })).toBeVisible();

    // Switch to Sprints — click the tab button with exact text "Sprints"
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    // Wait for transition (150ms) + verify "New Sprint" button appears
    await expect(page.getByRole('main').getByRole('button', { name: 'New Sprint' })).toBeVisible({ timeout: 5_000 });

    // Switch back to Tasks — click the tab button with exact text "Tasks"
    await page.getByRole('main').getByRole('button', { name: 'Tasks', exact: true }).click();
    await expect(page.getByRole('main').getByRole('button', { name: 'New Task' })).toBeVisible({ timeout: 5_000 });
  });

  // ─── Task CRUD ─────────────────────────────────────────────────

  test('creates a task', async ({ page }) => {
    const taskTitle = `E2E Task ${Date.now()}`;

    await page.getByRole('main').getByRole('button', { name: 'New Task' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form using id selectors (FormField wraps Input/textarea with htmlFor)
    await page.locator('#task-title').fill(taskTitle);
    await page.locator('#task-desc').fill('E2E test description');
    await page.locator('#task-priority').selectOption('high');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    // Wait for success toast and list to show new task
    await expect(page.getByText('Task saved successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(taskTitle)).toBeVisible({ timeout: 5_000 });
  });

  test('edits a task', async ({ page }) => {
    // Create a task first
    const taskTitle = `E2E Edit ${Date.now()}`;
    await page.getByRole('main').getByRole('button', { name: 'New Task' }).click();
    await page.locator('#task-title').fill(taskTitle);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

    // Edit it — click Edit button in the row containing the task title
    const updatedTitle = `E2E Updated ${Date.now()}`;
    const row = page.getByRole('main').locator('tr').filter({ hasText: taskTitle });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Clear and fill new title (use fill which replaces all text)
    await page.locator('#task-title').fill(updatedTitle);
    await page.locator('#task-status').selectOption('in_progress');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    // Wait for dialog to close (mutation onSuccess → handleClose)
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // Reload page to ensure fresh data from API (invalidateQueries may be slow)
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

    // Verify updated title appears in the table
    await expect(page.getByRole('main').getByText(updatedTitle)).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a task', async ({ page }) => {
    // Create a task first
    const taskTitle = `E2E Delete ${Date.now()}`;
    await page.getByRole('main').getByRole('button', { name: 'New Task' }).click();
    await page.locator('#task-title').fill(taskTitle);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

    // Delete it
    const row = page.getByRole('main').locator('tr').filter({ hasText: taskTitle });
    await row.getByRole('button', { name: 'Delete' }).click();

    // ConfirmDialog shows: <p> message + Cancel + Confirm buttons
    // Wait for the confirmation dialog's <p> element (the message)
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();

    // Click the "Confirm" button inside the dialog
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Task deleted successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(taskTitle)).not.toBeVisible({ timeout: 5_000 });
  });

  test('searches and filters tasks', async ({ page }) => {
    // Create a unique task
    const uniqueTitle = `E2E Search ${Date.now()}`;
    await page.getByRole('main').getByRole('button', { name: 'New Task' }).click();
    await page.locator('#task-title').fill(uniqueTitle);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(uniqueTitle)).toBeVisible({ timeout: 10_000 });

    // The search input has placeholder "Search tasks..." — use it
    const searchInput = page.getByRole('main').getByPlaceholder(/search/i);
    await searchInput.fill(uniqueTitle);
    await expect(page.getByRole('main').getByText(uniqueTitle)).toBeVisible();

    // Search for non-existent
    await searchInput.fill('ZZZ_NONEXISTENT_12345');
    await expect(page.getByRole('main').getByText(uniqueTitle)).not.toBeVisible({ timeout: 5_000 });
  });

  // ─── Sprint CRUD ───────────────────────────────────────────────

  test('creates a sprint', async ({ page }) => {
    const sprintName = `E2E Sprint ${Date.now()}`;

    // Switch to Sprints tab
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'New Sprint' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('#sprint-name').fill(sprintName);
    await page.locator('#sprint-goal').fill('E2E sprint goal');
    await page.locator('#sprint-start').fill('2026-04-11');
    await page.locator('#sprint-end').fill('2026-04-25');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Sprint saved successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(sprintName)).toBeVisible({ timeout: 5_000 });
  });

  test('edits a sprint', async ({ page }) => {
    const sprintName = `E2E Edit Sprint ${Date.now()}`;

    // Create sprint
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'New Sprint' }).click();
    await page.locator('#sprint-name').fill(sprintName);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(sprintName)).toBeVisible({ timeout: 10_000 });

    // Edit it
    const updatedName = `E2E Updated Sprint ${Date.now()}`;
    const row = page.getByRole('main').locator('tr').filter({ hasText: sprintName });
    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('#sprint-name').fill(updatedName);
    await page.locator('#sprint-status').selectOption('active');
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();

    // Wait for dialog to close
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // Reload page to ensure fresh data from API
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

    // Switch to Sprints tab after reload
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    await expect(page.getByRole('main').getByText(updatedName)).toBeVisible({ timeout: 10_000 });
  });

  test('deletes a sprint', async ({ page }) => {
    const sprintName = `E2E Del Sprint ${Date.now()}`;

    // Create sprint
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'New Sprint' }).click();
    await page.locator('#sprint-name').fill(sprintName);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(sprintName)).toBeVisible({ timeout: 10_000 });

    // Delete it
    const row = page.getByRole('main').locator('tr').filter({ hasText: sprintName });
    await row.getByRole('button', { name: 'Delete' }).click();

    // Wait for the confirmation dialog's message paragraph
    await expect(page.getByRole('dialog').locator('p').filter({ hasText: /sure/i })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Confirm' }).click();

    await expect(page.getByText('Sprint deleted successfully')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('main').getByText(sprintName)).not.toBeVisible({ timeout: 5_000 });
  });

  // ─── Sprint ↔ Task Assignment ──────────────────────────────────

  test('assigns tasks to a sprint', async ({ page }) => {
    const sprintName = `E2E Assign Sprint ${Date.now()}`;
    const taskTitle = `E2E Assign Task ${Date.now()}`;

    // Create a task (on Tasks tab, which is default)
    await page.getByRole('main').getByRole('button', { name: 'New Task' }).click();
    await page.locator('#task-title').fill(taskTitle);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(taskTitle)).toBeVisible({ timeout: 10_000 });

    // Switch to Sprints tab and create a sprint
    await page.getByRole('main').getByRole('button', { name: 'Sprints', exact: true }).click();
    await page.getByRole('main').getByRole('button', { name: 'New Sprint' }).click();
    await page.locator('#sprint-name').fill(sprintName);
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('main').getByText(sprintName)).toBeVisible({ timeout: 10_000 });

    // Click "Assign Tasks" button in the sprint's row
    const sprintRow = page.getByRole('main').locator('tr').filter({ hasText: sprintName });
    await sprintRow.getByRole('button', { name: 'Assign Tasks' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Wait for the task to appear in the dialog (may take a moment for API response).
    // Use the checkbox input which has id="task-{taskId}" and the label with the task title.
    // Fallback: if "No tasks found" appears, the API returned no assignable tasks.
    const taskInDialog = page.getByRole('dialog').getByText(taskTitle);
    await expect(taskInDialog).toBeVisible({ timeout: 15_000 });

    // Click the checkbox input next to the task title
    const taskContainer = page.getByRole('dialog').locator('div.flex.items-center').filter({ hasText: taskTitle });
    await taskContainer.locator('input[type="checkbox"]').check();

    // Save assignment
    await page.getByRole('dialog').getByRole('button', { name: 'Save' }).click();
    // Wait for dialog to close on success
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 10_000 });

    // Verify: go to Tasks tab, the task row should show the sprint name
    await page.getByRole('main').getByRole('button', { name: 'Tasks', exact: true }).click();

    // Reload to ensure fresh data
    await page.reload();
    await expect(page.getByRole('main')).toBeVisible({ timeout: 10_000 });

    const taskRow = page.getByRole('main').locator('tr').filter({ hasText: taskTitle });
    await expect(taskRow.getByText(sprintName)).toBeVisible({ timeout: 10_000 });
  });
});
