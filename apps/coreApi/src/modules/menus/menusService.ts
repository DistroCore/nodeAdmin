import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Pool } from 'pg';

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

@Injectable()
export class MenusService {
  private readonly logger = new Logger(MenusService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async findAll(): Promise<MenuItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus ORDER BY sort_order, created_at'
    );
    return this.buildTree(result.rows);
  }

  async findById(id: string): Promise<MenuItem> {
    if (!this.pool) throw new NotFoundException('Menu not found');
    const result = await this.pool.query(
      'SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at FROM menus WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) throw new NotFoundException('Menu not found');
    return result.rows[0];
  }

  async create(data: {
    parentId?: string;
    name: string;
    path?: string;
    icon?: string;
    sortOrder?: number;
    permissionCode?: string;
    isVisible?: boolean;
  }) {
    if (!this.pool) throw new Error('Database not available');
    const id = `menu-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await this.pool.query(
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
      ]
    );
    return this.findById(id);
  }

  async update(
    id: string,
    data: {
      parentId?: string;
      name?: string;
      path?: string;
      icon?: string;
      sortOrder?: number;
      permissionCode?: string;
      isVisible?: boolean;
    }
  ) {
    if (!this.pool) throw new Error('Database not available');
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (data.parentId !== undefined) {
      sets.push(`parent_id = $${++idx}`);
      params.push(data.parentId);
    }
    if (data.name !== undefined) {
      sets.push(`name = $${++idx}`);
      params.push(data.name);
    }
    if (data.path !== undefined) {
      sets.push(`path = $${++idx}`);
      params.push(data.path);
    }
    if (data.icon !== undefined) {
      sets.push(`icon = $${++idx}`);
      params.push(data.icon);
    }
    if (data.sortOrder !== undefined) {
      sets.push(`sort_order = $${++idx}`);
      params.push(data.sortOrder);
    }
    if (data.permissionCode !== undefined) {
      sets.push(`permission_code = $${++idx}`);
      params.push(data.permissionCode);
    }
    if (data.isVisible !== undefined) {
      sets.push(`is_visible = $${++idx}`);
      params.push(data.isVisible);
    }

    if (sets.length === 0) return this.findById(id);

    params.push(id);
    await this.pool.query(`UPDATE menus SET ${sets.join(', ')} WHERE id = $${idx + 1}`, params);
    return this.findById(id);
  }

  async remove(id: string) {
    if (!this.pool) throw new Error('Database not available');
    await this.pool.query('DELETE FROM role_menus WHERE menu_id = $1', [id]);
    const children = await this.pool.query('SELECT id FROM menus WHERE parent_id = $1', [id]);
    for (const child of children.rows) {
      await this.remove(child.id);
    }
    const result = await this.pool.query('DELETE FROM menus WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw new NotFoundException('Menu not found');
  }

  async getRoleMenus(roleId: string): Promise<string[]> {
    if (!this.pool) return [];
    const result = await this.pool.query('SELECT menu_id FROM role_menus WHERE role_id = $1', [
      roleId,
    ]);
    return result.rows.map((r: any) => r.menu_id);
  }

  async setRoleMenus(roleId: string, menuIds: string[]) {
    if (!this.pool) throw new Error('Database not available');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM role_menus WHERE role_id = $1', [roleId]);
      for (const menuId of menuIds) {
        await client.query('INSERT INTO role_menus (role_id, menu_id) VALUES ($1, $2)', [
          roleId,
          menuId,
        ]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return this.getRoleMenus(roleId);
  }

  async getUserMenus(tenantId: string, userId: string): Promise<MenuItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `WITH RECURSIVE accessible_menus AS (
         SELECT DISTINCT m.id, m.parent_id, m.name, m.path, m.icon, m.sort_order, m.permission_code, m.is_visible, m.created_at
         FROM menus m
         INNER JOIN role_menus rm ON rm.menu_id = m.id
         INNER JOIN user_roles ur ON ur.role_id = rm.role_id
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE r.tenant_id = $1 AND ur.user_id = $2 AND m.is_visible = 1

         UNION

         SELECT parent.id, parent.parent_id, parent.name, parent.path, parent.icon, parent.sort_order, parent.permission_code, parent.is_visible, parent.created_at
         FROM menus parent
         INNER JOIN accessible_menus child ON child.parent_id = parent.id
         WHERE parent.is_visible = 1
       )
       SELECT id, parent_id, name, path, icon, sort_order, permission_code, is_visible, created_at
       FROM accessible_menus
       ORDER BY sort_order, created_at`,
      [tenantId, userId]
    );
    return this.buildTree(result.rows);
  }

  private buildTree(rows: any[]): MenuItem[] {
    const map = new Map<string, MenuItem>();
    const roots: MenuItem[] = [];
    for (const row of rows) {
      map.set(row.id, { ...row, children: [] });
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

  private sortTree(nodes: any[]): MenuItem[] {
    nodes.sort(
      (left, right) =>
        left.sort_order - right.sort_order || left.created_at.getTime() - right.created_at.getTime()
    );

    for (const node of nodes) {
      if (node.children) {
        node.children = this.sortTree(node.children);
      }
    }

    return nodes;
  }
}
