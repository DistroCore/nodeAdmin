import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { TenantContextResolver } from '../../infrastructure/tenant/tenantContextResolver';
import type { AuthIdentity } from '../auth/authIdentity';
import { PluginService } from './pluginService';

@Injectable()
export class PluginGuard implements CanActivate {
  constructor(
    private readonly pluginService: PluginService,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ url?: string; user?: AuthIdentity }>();
    const pluginId = this.extractPluginId(request.url);
    if (!pluginId) {
      return true;
    }

    let tenantId: string;

    try {
      tenantId = this.tenantContextResolver.resolve(request.user).tenantId;
    } catch {
      throw new ForbiddenException('Tenant context is required for plugin-protected routes');
    }

    const enabled = await this.pluginService.isPluginEnabled(tenantId, pluginId);
    if (!enabled) {
      throw new ForbiddenException(`Plugin '${pluginId}' is not enabled for this tenant`);
    }

    return true;
  }

  private extractPluginId(url?: string): string | null {
    if (!url) {
      return null;
    }

    const pathname = url.split('?')[0];
    const match = /^\/api\/v1\/plugins\/([^/]+)(?:\/|$)/.exec(pathname);
    if (!match?.[1]) {
      return null;
    }

    return `@nodeadmin/plugin-${decodeURIComponent(match[1])}`;
  }
}
