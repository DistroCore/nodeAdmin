import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';

@Injectable()
export class RolesService {
  private readonly logger = new Logger(RolesService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async list(tenantId: string) {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
        COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.tenant_id = $1
      GROUP BY r.id
      ORDER BY r.created_at`,
      [tenantId]
    );
    return result.rows;
  }

  async findById(tenantId: string, roleId: string) {
    if (!this.pool) throw new NotFoundException('Role not found');
    const result = await this.pool.query(
      `SELECT r.id, r.name, r.description, r.is_system, r.created_at, r.updated_at,
        COALESCE(json_agg(json_build_object('id', p.id, 'code', p.code, 'name', p.name)) FILTER (WHERE p.id IS NOT NULL), '[]') as permissions
      FROM roles r
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON p.id = rp.permission_id
      WHERE r.tenant_id = $1 AND r.id = $2
      GROUP BY r.id`,
      [tenantId, roleId]
    );
    if (result.rows.length === 0) throw new NotFoundException('Role not found');
    return result.rows[0];
  }

  async create(tenantId: string, name: string, description?: string, permissionIds?: string[]) {
    if (!this.pool) throw new Error('Database not available');
    const roleId = randomUUID();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query(
        'INSERT INTO roles (id, tenant_id, name, description) VALUES ($1, $2, $3, $4)',
        [roleId, tenantId, name, description ?? null]
      );
      if (permissionIds && permissionIds.length > 0) {
        for (const permId of permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [roleId, permId]
          );
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, roleId);
  }

  async update(
    tenantId: string,
    roleId: string,
    data: { name?: string; description?: string; permissionIds?: string[] }
  ) {
    if (!this.pool) throw new Error('Database not available');

    // Check not system role
    const check = await this.pool.query(
      'SELECT is_system FROM roles WHERE tenant_id = $1 AND id = $2',
      [tenantId, roleId]
    );
    if (check.rows.length === 0) throw new NotFoundException('Role not found');
    if (check.rows[0].is_system) throw new BadRequestException('Cannot modify system roles');

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
      if (data.description !== undefined) {
        sets.push(`description = $${++paramIdx}`);
        params.push(data.description);
      }

      if (sets.length > 0) {
        sets.push(`updated_at = now()`);
        params.push(tenantId, roleId);
        await client.query(
          `UPDATE roles SET ${sets.join(', ')} WHERE tenant_id = $${paramIdx + 1} AND id = $${paramIdx + 2}`,
          params
        );
      }

      if (data.permissionIds !== undefined) {
        await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
        for (const permId of data.permissionIds) {
          await client.query(
            'INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)',
            [roleId, permId]
          );
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.findById(tenantId, roleId);
  }

  async remove(tenantId: string, roleId: string) {
    if (!this.pool) throw new Error('Database not available');
    const check = await this.pool.query(
      'SELECT is_system FROM roles WHERE tenant_id = $1 AND id = $2',
      [tenantId, roleId]
    );
    if (check.rows.length === 0) throw new NotFoundException('Role not found');
    if (check.rows[0].is_system) throw new BadRequestException('Cannot delete system roles');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('DELETE FROM role_permissions WHERE role_id = $1', [roleId]);
      await client.query('DELETE FROM role_menus WHERE role_id = $1', [roleId]);
      await client.query('DELETE FROM user_roles WHERE role_id = $1', [roleId]);
      await client.query('DELETE FROM roles WHERE tenant_id = $1 AND id = $2', [tenantId, roleId]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async removeMany(tenantId: string, roleIds: string[]) {
    if (!this.pool) throw new Error('Database not available');

    const normalizedRoleIds = [...new Set(roleIds.map((roleId) => roleId.trim()).filter(Boolean))];
    if (normalizedRoleIds.length === 0) {
      return { deletedCount: 0 };
    }

    const check = await this.pool.query(
      'SELECT id, is_system FROM roles WHERE tenant_id = $1 AND id = ANY($2)',
      [tenantId, normalizedRoleIds]
    );

    if (check.rows.length !== normalizedRoleIds.length) {
      throw new NotFoundException('One or more roles not found');
    }

    if (check.rows.some((row) => row.is_system)) {
      throw new BadRequestException('Cannot delete system roles');
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      await client.query('DELETE FROM role_permissions WHERE role_id = ANY($1)', [
        normalizedRoleIds,
      ]);
      await client.query('DELETE FROM role_menus WHERE role_id = ANY($1)', [normalizedRoleIds]);
      await client.query('DELETE FROM user_roles WHERE role_id = ANY($1)', [normalizedRoleIds]);
      const result = await client.query(
        'DELETE FROM roles WHERE tenant_id = $1 AND id = ANY($2) RETURNING id',
        [tenantId, normalizedRoleIds]
      );
      await client.query('COMMIT');

      return { deletedCount: result.rows.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
