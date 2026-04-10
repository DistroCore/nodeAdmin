import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantContextResolver } from '../../infrastructure/tenant/tenantContextResolver';
import type { AuthIdentity } from '../auth/authIdentity';
import { PLUGIN_METADATA_KEY } from './plugin.decorator';
import { PluginService } from './pluginService';

@Injectable()
export class PluginGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly pluginService: PluginService,
    private readonly tenantContextResolver: TenantContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const pluginName = this.reflector.getAllAndOverride<string | undefined>(PLUGIN_METADATA_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!pluginName) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthIdentity }>();
    let tenantId: string;

    try {
      tenantId = this.tenantContextResolver.resolve(request.user).tenantId;
    } catch {
      throw new ForbiddenException('Tenant context is required for plugin-protected routes');
    }

    const enabled = await this.pluginService.isPluginEnabled(tenantId, pluginName);
    if (!enabled) {
      throw new ForbiddenException(`Plugin '${pluginName}' is not enabled for this tenant`);
    }

    return true;
  }
}
