import { Inject, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { hash } from 'bcryptjs';
import { Pool } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async list(tenantId: string, page = 1, pageSize = 20, search?: string) {
    if (!this.pool) return { items: [], total: 0, page, pageSize };
    const offset = (page - 1) * pageSize;
    let whereClause = 'WHERE u.tenant_id = $1';
    const params: unknown[] = [tenantId];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (u.email ILIKE $${params.length} OR u.name ILIKE $${params.length})`;
    }

    const countResult = await this.pool.query(`SELECT COUNT(*)::int as count FROM users u ${whereClause}`, params);
    const total = countResult.rows[0].count;

    const result = await this.pool.query(
      `SELECT u.id, u.tenant_id, u.email, u.phone, u.name, u.avatar, u.is_active, u.created_at, u.updated_at,
        COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      ${whereClause}
      GROUP BY u.id
      ORDER BY u.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, pageSize, offset],
    );

    return { items: result.rows, total, page, pageSize };
  }

  async findById(tenantId: string, userId: string) {
    if (!this.pool) throw new NotFoundException('User not found');
    const result = await this.pool.query(
      `SELECT u.id, u.tenant_id, u.email, u.phone, u.name, u.avatar, u.is_active, u.created_at, u.updated_at,
        COALESCE(json_agg(json_build_object('id', r.id, 'name', r.name)) FILTER (WHERE r.id IS NOT NULL), '[]') as roles
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE u.tenant_id = $1 AND u.id = $2
      GROUP BY u.id`,
      [tenantId, userId],
    );
    if (result.rows.length === 0) throw new NotFoundException('User not found');
    return result.rows[0];
  }

  async create(tenantId: string, email: string, password: string, name?: string, roleIds?: string[]) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const userId = randomUUID();
    const passwordHash = await hash(password, 12);

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('INSERT INTO users (id, tenant_id, email, password_hash, name) VALUES ($1, $2, $3, $4, $5)', [
        userId,
        tenantId,
        email,
        passwordHash,
        name ?? null,
      ]);
      if (roleIds && roleIds.length > 0) {
        for (const roleId of roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, userId);
  }

  async update(
    tenantId: string,
    userId: string,
    data: { name?: string; avatar?: string; isActive?: boolean; roleIds?: string[] },
  ) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);

      const sets: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 0;

      if (data.name !== undefined) {
        sets.push(`name = $${++paramIdx}`);
        params.push(data.name);
      }
      if (data.avatar !== undefined) {
        sets.push(`avatar = $${++paramIdx}`);
        params.push(data.avatar);
      }
      if (data.isActive !== undefined) {
        sets.push(`is_active = $${++paramIdx}`);
        params.push(data.isActive ? 1 : 0);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, userId);
        await client.query(
          `UPDATE users SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
          params,
        );
      }

      if (data.roleIds !== undefined) {
        await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
        for (const roleId of data.roleIds) {
          await client.query('INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2)', [userId, roleId]);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, userId);
  }

  async remove(tenantId: string, userId: string) {
    if (!this.pool) throw new ServiceUnavailableException('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
      const result = await client.query('DELETE FROM users WHERE tenant_id = $1 AND id = $2 RETURNING id', [
        tenantId,
        userId,
      ]);
      await client.query('COMMIT');
      if (result.rows.length === 0) throw new NotFoundException('User not found');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
