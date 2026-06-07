import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CurrentUser } from '../auth/currentUser.decorator';
import type { AuthIdentity } from '../auth/authIdentity';
import { PluginService } from './pluginService';

const PLUGIN_ID_PREFIX = '@nodeadmin/plugin-';

@ApiTags('plugins')
@ApiBearerAuth()
@Controller('tenants/me/plugins')
export class PluginController {
  constructor(private readonly pluginService: PluginService) {}

  @Get()
  @ApiOperation({ summary: 'List plugins enabled or configured for the current tenant' })
  async findMine(@CurrentUser() identity: AuthIdentity) {
    const plugins = await this.pluginService.listTenantPlugins(identity.tenantId);

    return {
      // Attach a uiUrl for plugins that actually ship a built UI bundle, so the shell can mount and
      // dynamically import it. The path is served publicly by PluginAssetController; the frontend
      // resolves it against the API base URL.
      plugins: plugins.map((plugin) => {
        const shortName = plugin.name.startsWith(PLUGIN_ID_PREFIX)
          ? plugin.name.slice(PLUGIN_ID_PREFIX.length)
          : plugin.name;
        const bundlePath = join(
          process.cwd(),
          'node_modules',
          '@nodeadmin',
          `plugin-${shortName}`,
          'dist',
          'ui',
          'index.js',
        );

        return {
          ...plugin,
          ...(existsSync(bundlePath) ? { uiUrl: `/api/v1/plugin-assets/${shortName}/ui.js` } : {}),
        };
      }),
    };
  }
}
