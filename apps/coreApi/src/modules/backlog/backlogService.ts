import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

@Injectable()
export class BacklogService {
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
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

    const countResult = await this.pool.query(`SELECT COUNT(*)::int as count FROM backlog_tasks t ${where}`, params);
    const total = countResult.rows[0].count;

    const result = await this.pool.query(
      `SELECT t.* FROM backlog_tasks t ${where}
       ORDER BY t.sort_order ASC, t.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return { items: result.rows, total, page, pageSize };
  }

  async findTaskById(tenantId: string, taskId: string) {
    if (!this.pool) throw new NotFoundException('Task not found');
    const result = await this.pool.query('SELECT * FROM backlog_tasks WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      taskId,
    ]);
    if (result.rows.length === 0) throw new NotFoundException('Task not found');
    return result.rows[0];
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
    if (!this.pool) throw new Error('Database not available');
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
    if (!this.pool) throw new Error('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.title !== undefined) {
        sets.push(`title = $${++paramIdx}`);
        params.push(data.title);
      }
      if (data.description !== undefined) {
        sets.push(`description = $${++paramIdx}`);
        params.push(data.description);
      }
      if (data.status !== undefined) {
        sets.push(`status = $${++paramIdx}`);
        params.push(data.status);
      }
      if (data.priority !== undefined) {
        sets.push(`priority = $${++paramIdx}`);
        params.push(data.priority);
      }
      if (data.assigneeId !== undefined) {
        sets.push(`assignee_id = $${++paramIdx}`);
        params.push(data.assigneeId);
      }
      if (data.sprintId !== undefined) {
        sets.push(`sprint_id = $${++paramIdx}`);
        params.push(data.sprintId);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, taskId);
        await client.query(
          `UPDATE backlog_tasks SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
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
    if (!this.pool) throw new Error('Database not available');
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

    const countResult = await this.pool.query(`SELECT COUNT(*)::int as count FROM backlog_sprints s ${where}`, params);
    const total = countResult.rows[0].count;

    const result = await this.pool.query(
      `SELECT s.* FROM backlog_sprints s ${where}
       ORDER BY s.created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return { items: result.rows, total, page, pageSize };
  }

  async findSprintById(tenantId: string, sprintId: string) {
    if (!this.pool) throw new NotFoundException('Sprint not found');
    const result = await this.pool.query('SELECT * FROM backlog_sprints WHERE tenant_id = $1 AND id = $2', [
      tenantId,
      sprintId,
    ]);
    if (result.rows.length === 0) throw new NotFoundException('Sprint not found');
    return result.rows[0];
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
    if (!this.pool) throw new Error('Database not available');
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
    if (!this.pool) throw new Error('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        sets.push(`name = $${++paramIdx}`);
        params.push(data.name);
      }
      if (data.goal !== undefined) {
        sets.push(`goal = $${++paramIdx}`);
        params.push(data.goal);
      }
      if (data.status !== undefined) {
        sets.push(`status = $${++paramIdx}`);
        params.push(data.status);
      }
      if (data.startDate !== undefined) {
        sets.push(`start_date = $${++paramIdx}`);
        params.push(data.startDate);
      }
      if (data.endDate !== undefined) {
        sets.push(`end_date = $${++paramIdx}`);
        params.push(data.endDate);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, sprintId);
        await client.query(
          `UPDATE backlog_sprints SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
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
    if (!this.pool) throw new Error('Database not available');
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
    if (!this.pool) throw new Error('Database not available');
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
