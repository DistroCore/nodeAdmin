import { ConflictException, Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

export interface TenantRecord {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  is_active: boolean;
  config_json: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async list(): Promise<TenantRecord[]> {
    if (!this.pool) return [];
    const result = await this.pool.query<TenantRecord>(
      'SELECT id, name, slug, logo, is_active, config_json, created_at, updated_at FROM tenants ORDER BY created_at',
    );
    return result.rows;
  }

  async findById(id: string): Promise<TenantRecord> {
    if (!this.pool) throw new NotFoundException('Tenant not found');
    const result = await this.pool.query<TenantRecord>(
      'SELECT id, name, slug, logo, is_active, config_json, created_at, updated_at FROM tenants WHERE id = $1',
      [id],
    );
    if (result.rows.length === 0) throw new NotFoundException('Tenant not found');
    return result.rows[0];
  }

  async create(data: { name: string; slug: string; logo?: string; isActive?: boolean }) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');

    const existing = await this.pool.query('SELECT id FROM tenants WHERE slug = $1', [data.slug]);
    if (existing.rows.length > 0) throw new ConflictException('Tenant slug already exists');

    const id = randomUUID();
    await this.pool.query(
      'INSERT INTO tenants (id, name, slug, logo, is_active, config_json) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, data.name, data.slug, data.logo ?? null, data.isActive === false ? 0 : 1, '{}'],
    );
    return this.findById(id);
  }

  async update(id: string, data: { name?: string; logo?: string; isActive?: boolean }) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');

    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 0;

    if (data.name !== undefined) {
      sets.push(`name = $${++idx}`);
      params.push(data.name);
    }
    if (data.logo !== undefined) {
      sets.push(`logo = $${++idx}`);
      params.push(data.logo);
    }
    if (data.isActive !== undefined) {
      sets.push(`is_active = $${++idx}`);
      params.push(data.isActive ? 1 : 0);
    }

    if (sets.length === 0) return this.findById(id);

    sets.push(`updated_at = now()`);
    params.push(id);
    const result = await this.pool.query(
      `UPDATE tenants SET ${sets.join(', ')} WHERE id = $${idx + 1} RETURNING id`,
      params,
    );
    if (result.rows.length === 0) throw new NotFoundException('Tenant not found');
    return this.findById(id);
  }

  async remove(id: string) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    if (id === 'default') throw new ConflictException('Cannot delete the default tenant');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM oauth_accounts WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [
        id,
      ]);
      await client.query('DELETE FROM user_roles WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [id]);
      await client.query('DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = $1)', [
        id,
      ]);
      await client.query('DELETE FROM role_menus WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = $1)', [id]);
      await client.query('DELETE FROM users WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM roles WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM backlog_tasks WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM backlog_sprints WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM messages WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM conversations WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM outbox_events WHERE tenant_id = $1', [id]);
      await client.query('DELETE FROM audit_logs WHERE tenant_id = $1', [id]);

      const result = await client.query('DELETE FROM tenants WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) {
        throw new NotFoundException('Tenant not found');
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
