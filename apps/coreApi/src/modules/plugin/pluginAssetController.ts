import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PLUGIN_NAME_PATTERN = /^[a-z0-9-]+$/;

/**
 * Serves plugin UI bundles so the admin shell can dynamically import them. Public + unguarded (an ESM
 * import carries no auth header, and the bundle is just frontend code — the data behind it stays
 * protected by JwtAuthGuard + PluginGuard on the plugin's API routes). Mounted off `/plugin-assets`
 * so it doesn't match the `/api/v1/plugins/*` PluginGuard pattern.
 */
@ApiTags('plugins')
@Controller('plugin-assets')
export class PluginAssetController {
  @Get(':name/ui.js')
  @ApiOperation({ summary: 'Serve a plugin UI bundle (public)' })
  @Header('Content-Type', 'text/javascript; charset=utf-8')
  @Header('Cache-Control', 'no-cache')
  getUiBundle(@Param('name') name: string): string {
    if (!PLUGIN_NAME_PATTERN.test(name)) {
      throw new NotFoundException('Unknown plugin');
    }

    const bundlePath = join(process.cwd(), 'node_modules', '@nodeadmin', `plugin-${name}`, 'dist', 'ui', 'index.js');
    if (!existsSync(bundlePath)) {
      throw new NotFoundException('Plugin UI bundle not found');
    }

    return readFileSync(bundlePath, 'utf8');
  }
}
