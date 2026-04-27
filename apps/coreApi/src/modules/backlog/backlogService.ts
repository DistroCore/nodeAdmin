import { Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

@Injectable()
export class BacklogService {
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  // ─── Tasks ────────────────────────────────────────────────────────

  async listTasks(
    tenantId: string,
    page = 1,
    pageSize = 20,
    filters?: { status?: string; sprintId?: string; search?: string },
  ) {
    if (!this.pool) return { items: [], total: 0, page, pageSize };
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['t.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`t.status = $${params.length}`);
    }
    if (filters?.sprintId) {
      params.push(filters.sprintId);
      conditions.push(`t.sprint_id = $${params.length}`);
    }
    if (filters?.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`t.title ILIKE $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
      const countResult = await client.query(`SELECT COUNT(*)::int as count FROM backlog_tasks t ${where}`, params);
      const total = countResult.rows[0].count;

      const result = await client.query(
        `SELECT t.* FROM backlog_tasks t ${where}
         ORDER BY t.sort_order ASC, t.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      );

      return { items: result.rows, total, page, pageSize };
    } finally {
      client.release();
    }
  }

  async findTaskById(tenantId: string, taskId: string) {
    if (!this.pool) throw new NotFoundException('Task not found');
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
      const result = await client.query('SELECT * FROM backlog_tasks WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        taskId,
      ]);
      if (result.rows.length === 0) throw new NotFoundException('Task not found');
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async createTask(
    tenantId: string,
    data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      sprintId?: string;
      createdBy?: string;
    },
  ) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const taskId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        `INSERT INTO backlog_tasks (id, tenant_id, title, description, status, priority, assignee_id, sprint_id, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          taskId,
          tenantId,
          data.title,
          data.description ?? null,
          data.status ?? 'todo',
          data.priority ?? 'medium',
          data.assigneeId ?? null,
          data.sprintId ?? null,
          data.createdBy ?? null,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findTaskById(tenantId, taskId);
  }

  async updateTask(
    tenantId: string,
    taskId: string,
    data: {
      title?: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      sprintId?: string;
    },
  ) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];

      if (data.title !== undefined) {
        params.push(data.title);
        sets.push(`title = $${params.length}`);
      }
      if (data.description !== undefined) {
        params.push(data.description);
        sets.push(`description = $${params.length}`);
      }
      if (data.status !== undefined) {
        params.push(data.status);
        sets.push(`status = $${params.length}`);
      }
      if (data.priority !== undefined) {
        params.push(data.priority);
        sets.push(`priority = $${params.length}`);
      }
      if (data.assigneeId !== undefined) {
        params.push(data.assigneeId);
        sets.push(`assignee_id = $${params.length}`);
      }
      if (data.sprintId !== undefined) {
        params.push(data.sprintId);
        sets.push(`sprint_id = $${params.length}`);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId);
        params.push(taskId);
        await client.query(
          `UPDATE backlog_tasks SET ${sets.join(', ')} WHERE tenant_id = $${params.length - 1} AND id = $${params.length}`,
          params,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findTaskById(tenantId, taskId);
  }

  async removeTask(tenantId: string, taskId: string) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await client.query('DELETE FROM backlog_tasks WHERE tenant_id = $1 AND id = $2 RETURNING id', [
        tenantId,
        taskId,
      ]);
      await client.query('COMMIT');
      if (result.rows.length === 0) throw new NotFoundException('Task not found');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Sprints ──────────────────────────────────────────────────────

  async listSprints(tenantId: string, page = 1, pageSize = 20, filters?: { status?: string; search?: string }) {
    if (!this.pool) return { items: [], total: 0, page, pageSize };
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['s.tenant_id = $1'];
    const params: unknown[] = [tenantId];

    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`s.status = $${params.length}`);
    }
    if (filters?.search) {
      params.push(`%${filters.search}%`);
      conditions.push(`s.name ILIKE $${params.length}`);
    }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
      const countResult = await client.query(`SELECT COUNT(*)::int as count FROM backlog_sprints s ${where}`, params);
      const total = countResult.rows[0].count;

      const result = await client.query(
        `SELECT s.* FROM backlog_sprints s ${where}
         ORDER BY s.created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, offset],
      );

      return { items: result.rows, total, page, pageSize };
    } finally {
      client.release();
    }
  }

  async findSprintById(tenantId: string, sprintId: string) {
    if (!this.pool) throw new NotFoundException('Sprint not found');
    const client = await this.pool.connect();
    try {
      await client.query(`SELECT set_config('app.current_tenant', $1, false)`, [tenantId]);
      const result = await client.query('SELECT * FROM backlog_sprints WHERE tenant_id = $1 AND id = $2', [
        tenantId,
        sprintId,
      ]);
      if (result.rows.length === 0) throw new NotFoundException('Sprint not found');
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async createSprint(
    tenantId: string,
    data: {
      name: string;
      goal?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const sprintId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        `INSERT INTO backlog_sprints (id, tenant_id, name, goal, status, start_date, end_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          sprintId,
          tenantId,
          data.name,
          data.goal ?? null,
          data.status ?? 'planning',
          data.startDate ?? null,
          data.endDate ?? null,
        ],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findSprintById(tenantId, sprintId);
  }

  async updateSprint(
    tenantId: string,
    sprintId: string,
    data: {
      name?: string;
      goal?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];

      if (data.name !== undefined) {
        params.push(data.name);
        sets.push(`name = $${params.length}`);
      }
      if (data.goal !== undefined) {
        params.push(data.goal);
        sets.push(`goal = $${params.length}`);
      }
      if (data.status !== undefined) {
        params.push(data.status);
        sets.push(`status = $${params.length}`);
      }
      if (data.startDate !== undefined) {
        params.push(data.startDate);
        sets.push(`start_date = $${params.length}`);
      }
      if (data.endDate !== undefined) {
        params.push(data.endDate);
        sets.push(`end_date = $${params.length}`);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId);
        params.push(sprintId);
        await client.query(
          `UPDATE backlog_sprints SET ${sets.join(', ')} WHERE tenant_id = $${params.length - 1} AND id = $${params.length}`,
          params,
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findSprintById(tenantId, sprintId);
  }

  async removeSprint(tenantId: string, sprintId: string) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await client.query('DELETE FROM backlog_sprints WHERE tenant_id = $1 AND id = $2 RETURNING id', [
        tenantId,
        sprintId,
      ]);
      await client.query('COMMIT');
      if (result.rows.length === 0) throw new NotFoundException('Sprint not found');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // ─── Sprint → Task Assignment ─────────────────────────────────────

  async assignTasksToSprint(tenantId: string, sprintId: string, taskIds: string[]) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    await this.findSprintById(tenantId, sprintId);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      for (const taskId of taskIds) {
        await client.query(
          'UPDATE backlog_tasks SET sprint_id = $1, updated_at = now() WHERE tenant_id = $2 AND id = $3',
          [sprintId, tenantId, taskId],
        );
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return this.listTasks(tenantId, 1, 100, { sprintId });
  }
}
