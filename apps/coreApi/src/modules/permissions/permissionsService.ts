import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';

export interface PermissionItem {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
}

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly pool: Pool | null;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL?.trim();
    if (!databaseUrl) {
      this.pool = null;
    } else {
      this.pool = new Pool({ connectionString: databaseUrl, max: 10 });
    }
  }

  async findAll(): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, code, name, module, description FROM permissions ORDER BY module, code',
    );
    return result.rows;
  }

  async findByModule(module: string): Promise<PermissionItem[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      'SELECT id, code, name, module, description FROM permissions WHERE module = $1 ORDER BY code',
      [module],
    );
    return result.rows;
  }
}
