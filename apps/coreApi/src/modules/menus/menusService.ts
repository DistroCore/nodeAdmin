import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool, PoolClient } from 'pg';
import { DatabaseService } from '../../infrastructure/database/databaseService';

export interface MenuItem {
  id: string;
  parentId: string | null;
  name: string;
  path: string | null;
  icon: string | null;
  sortOrder: number;
  permissionCode: string | null;
  isVisible: boolean;
  createdAt: Date;
  children?: MenuItem[];
}

interface MenuRow {
  id: string;
  parent_id: string | null;
  name: string;
  path: string | null;
  icon: string | null;
  sort_order: number;
  permission_code: string | null;
  is_visible: boolean;
  created_at: Date;
  menu_id?: string;
}

@Injectable()
export class MenusService {
  private readonly pool: Pool | null;

  constructor(@Inject(DatabaseService) databaseService: DatabaseService = new DatabaseService()) {
    this.pool = (databaseService.drizzle?.$client as Pool | undefined) ?? null;
  }

  async findAll(tenantId: string): Promise<MenuItem[]> {
    if (!this.pool) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus ORDER BY sort_order, created_at',
      );
      return this.buildTree(result.rows as MenuRow[]);
    });
  }

  async findById(tenantId: string, id: string): Promise<MenuItem> {
    if (!this.pool) throw new NotFoundException('Menu not found');
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus WHERE id = $1',
        [id],
      );
      if (result.rows.length === 0) throw new NotFoundException('Menu not found');
      return result.rows[0] as MenuItem;
    });
  }

  async create(
    tenantId: string,
    data: {
      parentId?: string;
      name: string;
      path?: string;
      icon?: string;
      sortOrder?: number;
      permissionCode?: string;
      isVisible?: boolean;
    },
  ) {
    if (!this.pool) throw new Error('Database not available');
    const id = `menu-${randomUUID()}`;
    await this.withTenantContext(tenantId, async (client) => {
      await client.query(
        'INSERT INTO menus (id, parent_id, name, path, icon, sort_order, permission_code, is_visible) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          id,
          data.parentId ?? null,
          data.name,
          data.path ?? null,
          data.icon ?? null,
          data.sortOrder ?? 0,
          data.permissionCode ?? null,
          data.isVisible !== false,
        ],
      );
    });
    return this.findById(tenantId, id);
  }

  async update(
    tenantId: string,
    id: string,
    data: {
      parentId?: string;
      name?: string;
      path?: string;
      icon?: string;
      sortOrder?: number;
      permissionCode?: string;
      isVisible?: boolean;
    },
  ) {
    if (!this.pool) throw new Error('Database not available');
    const sets: string[] = [];
    const params: unknown[] = [];

    if (data.parentId !== undefined) {
      params.push(data.parentId);
      sets.push(`parent_id = $${params.length}`);
    }
    if (data.name !== undefined) {
      params.push(data.name);
      sets.push(`name = $${params.length}`);
    }
    if (data.path !== undefined) {
      params.push(data.path);
      sets.push(`path = $${params.length}`);
    }
    if (data.icon !== undefined) {
      params.push(data.icon);
      sets.push(`icon = $${params.length}`);
    }
    if (data.sortOrder !== undefined) {
      params.push(data.sortOrder);
      sets.push(`sort_order = $${params.length}`);
    }
    if (data.permissionCode !== undefined) {
      params.push(data.permissionCode);
      sets.push(`permission_code = $${params.length}`);
    }
    if (data.isVisible !== undefined) {
      params.push(data.isVisible);
      sets.push(`is_visible = $${params.length}`);
    }

    if (sets.length === 0) return this.findById(tenantId, id);

    params.push(id);
    await this.withTenantContext(tenantId, async (client) => {
      await client.query(`UPDATE menus SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
    });
    return this.findById(tenantId, id);
  }

  async remove(tenantId: string, id: string) {
    if (!this.pool) throw new Error('Database not available');
    await this.withTenantContext(tenantId, async (client) => {
      await client.query('DELETE FROM role_menus WHERE menu_id = $1', [id]);
      const children = await client.query('SELECT id FROM menus WHERE parent_id = $1', [id]);
      for (const child of children.rows) {
        await this.remove(tenantId, child.id as string);
      }
      const result = await client.query('DELETE FROM menus WHERE id = $1 RETURNING id', [id]);
      if (result.rows.length === 0) throw new NotFoundException('Menu not found');
    });
  }

  async getRoleMenus(tenantId: string, roleId: string): Promise<string[]> {
    if (!this.pool) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query('SELECT menu_id FROM role_menus WHERE role_id = $1', [roleId]);
      return result.rows.map((r) => (r as MenuRow).menu_id ?? (r as MenuRow).id);
    });
  }

  async setRoleMenus(tenantId: string, roleId: string, menuIds: string[]) {
    if (!this.pool) throw new Error('Database not available');
    await this.withTenantContext(tenantId, async (client) => {
      await client.query('DELETE FROM role_menus WHERE role_id = $1', [roleId]);
      for (const menuId of menuIds) {
        await client.query('INSERT INTO role_menus (role_id, menu_id) VALUES ($1, $2)', [roleId, menuId]);
      }
    });
    return this.getRoleMenus(tenantId, roleId);
  }

  async getUserMenus(tenantId: string, userId: string): Promise<MenuItem[]> {
    if (!this.pool) return [];
    return this.withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `WITH RECURSIVE accessible_menus AS (
           SELECT DISTINCT m.id, m.parent_id, m.name, m.path, m.icon, m.sort_order, m.permission_code, m.is_visible, m.created_at
           FROM menus m
           INNER JOIN role_menus rm ON rm.menu_id = m.id
           INNER JOIN user_roles ur ON ur.role_id = rm.role_id
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE r.tenant_id = $1 AND ur.user_id = $2 AND m.is_visible = true

           UNION

           SELECT parent.id, parent.parent_id, parent.name, parent.path, parent.icon, parent.sort_order, parent.permission_code, parent.is_visible, parent.created_at
           FROM menus parent
           INNER JOIN accessible_menus child ON child.parent_id = parent.id
           WHERE parent.is_visible = true
         )
         SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at
         FROM accessible_menus
         ORDER BY sort_order, created_at`,
        [tenantId, userId],
      );
      return this.buildTree(result.rows as MenuRow[]);
    });
  }

  private async withTenantContext<T>(tenantId: string, callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool!.connect();

    try {
      await client.query('BEGIN');
      await client.query(`SELECT set_config('app.current_tenant', $1, true)`, [tenantId]);
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private toMenuItem(row: MenuRow): MenuItem {
    return {
      id: row.id,
      parent_id: row.parent_id,
      name: row.name,
      path: row.path,
      icon: row.icon,
      sort_order: row.sort_order,
      permission_code: row.permission_code,
      is_visible: row.is_visible,
      created_at: row.created_at,
      children: [],
    };
  }

  private buildTree(rows: MenuRow[]): MenuItem[] {
    const map = new Map<string, MenuItem>();
    const roots: MenuItem[] = [];
    for (const row of rows) {
      map.set(row.id, this.toMenuItem(row));
    }
    for (const row of rows) {
      const node = map.get(row.id)!;
      if (row.parent_id && map.has(row.parent_id)) {
        map.get(row.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    }
    return this.sortTree(roots);
  }

  private sortTree(nodes: MenuItem[]): MenuItem[] {
    nodes.sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        new Date(left.created_at).getTime() - new Date(right.created_at).getTime(),
    );

    for (const node of nodes) {
      if (node.children) {
        node.children = this.sortTree(node.children);
      }
    }

    return nodes;
  }
}
