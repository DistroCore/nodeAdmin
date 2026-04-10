import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import type { Dirent } from 'node:fs';
import type { PluginManifest } from '@nodeadmin/shared-types';
import { ManifestValidationError, validatePluginManifest } from './manifestValidator';

interface FileSystemLike {
  readFile(path: string, encoding: BufferEncoding): Promise<string>;
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<Pick<Dirent, 'isDirectory' | 'name'>>>;
}

type ModuleLoader = (modulePath: string) => unknown;

export interface RegisteredPlugin {
  id: string;
  manifest: PluginManifest;
  packageRoot: string;
  routePrefix: string;
}

@Injectable()
export class PluginRegistryService {
  private readonly logger = new Logger(PluginRegistryService.name);
  private readonly registry = new Map<string, RegisteredPlugin>();
  private fs: FileSystemLike = fs;
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic plugin loading requires require() for CommonJS modules
  private moduleLoader: ModuleLoader = (modulePath) => require(modulePath);
  private nodeModulesScopePath = join(process.cwd(), 'node_modules', '@nodeadmin');

  async scanInstalledPlugins(): Promise<RegisteredPlugin[]> {
    const directoryEntries = await this.readPluginDirectories();
    const registrations: RegisteredPlugin[] = [];

    for (const entry of directoryEntries) {
      const packageRoot = join(this.nodeModulesScopePath, entry.name);
      const manifest = await this.readManifest(packageRoot);

      if (!manifest) {
        continue;
      }

      const registration: RegisteredPlugin = {
        id: manifest.id,
        manifest,
        packageRoot,
        routePrefix: this.toRoutePrefix(manifest.id),
      };

      registrations.push(registration);
      this.registry.set(registration.id, registration);
    }

    registrations.sort((left, right) => left.id.localeCompare(right.id));
    return registrations;
  }

  getPluginModule(pluginId: string): unknown {
    const registration = this.registry.get(pluginId);

    if (!registration) {
      throw new Error(`Plugin '${pluginId}' is not registered`);
    }

    const modulePath = join(registration.packageRoot, registration.manifest.entrypoints.server);
    const loadedModule = this.moduleLoader(modulePath);

    if (isRecord(loadedModule) && loadedModule.default) {
      return loadedModule.default;
    }

    return loadedModule;
  }

  getRegisteredPlugins(): RegisteredPlugin[] {
    return [...this.registry.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  private async readPluginDirectories(): Promise<Array<Pick<Dirent, 'isDirectory' | 'name'>>> {
    try {
      const entries = await this.fs.readdir(this.nodeModulesScopePath, {
        withFileTypes: true,
      });

      return entries.filter((entry) => entry.isDirectory() && entry.name.startsWith('plugin-'));
    } catch (error) {
      if (isRecord(error) && error.code === 'ENOENT') {
        return [];
      }

      throw error;
    }
  }

  private async readManifest(packageRoot: string): Promise<PluginManifest | null> {
    const manifestPath = join(packageRoot, 'nodeadmin-plugin.json');
    const content = await this.fs.readFile(manifestPath, 'utf8');

    let parsedManifest: unknown;
    try {
      parsedManifest = JSON.parse(content);
    } catch {
      throw new ManifestValidationError(['nodeadmin-plugin.json contains invalid JSON']);
    }

    try {
      return validatePluginManifest(parsedManifest);
    } catch (error) {
      if (error instanceof ManifestValidationError) {
        this.logger.warn(`Skipping invalid plugin manifest at ${manifestPath}: ${error.message}`);
        return null;
      }

      throw error;
    }
  }

  private toRoutePrefix(pluginId: string): string {
    return `/plugins/${pluginId.replace('@nodeadmin/plugin-', '')}`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
