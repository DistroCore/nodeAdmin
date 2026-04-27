export interface PluginMetadata {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
}

export interface PluginManifestAuthor {
  name: string;
  email?: string;
}

export interface PluginManifestEngines {
  nodeAdmin: string;
}

export interface PluginManifestEntrypoints {
  server: string;
  ui?: string;
  settings?: string;
}

export interface PluginManifestMenuContribution {
  name: string;
  icon?: string;
  route: string;
}

export interface PluginManifestContributes {
  menus?: PluginManifestMenuContribution[];
  routes?: string[];
}

export interface PluginManifestLifecycle {
  onInstall?: string;
  onUninstall?: string;
}

export interface PluginManifest {
  id: string;
  version: string;
  displayName: string;
  description: string;
  author: PluginManifestAuthor;
  engines: PluginManifestEngines;
  permissions: string[];
  dependencies?: string[];
  entrypoints: PluginManifestEntrypoints;
  contributes?: PluginManifestContributes;
  lifecycle?: PluginManifestLifecycle;
}

export interface PluginModule {
  metadata: PluginMetadata;
  // NestJS module classes live in coreApi, so shared-types keeps this untyped on purpose.
  module: any;
  routes?: string[];
}

export interface PluginRegistryItem {
  id: string;
  displayName: string;
  description: string | null;
  authorName: string | null;
  latestVersion: string;
  downloadCount: number;
  isPublic: boolean;
  createdAt: string;
}

export interface PluginVersion {
  version: string;
  changelog: string | null;
  publishedAt: string;
  minPlatformVersion: string | null;
}

export interface PluginRegistryDetail extends PluginRegistryItem {
  versions: PluginVersion[];
}

export interface MarketplaceResponse {
  plugins: PluginRegistryItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PluginInstallResponse {
  success: boolean;
  installedVersion: string;
  pluginId: string;
}

export interface PluginUpdateResponse {
  success: boolean;
  updatedVersion: string;
  pluginId: string;
}

export interface TenantPluginInfo {
  name: string;
  enabled: boolean;
  config: Record<string, unknown>;
  enabledAt: string | null;
  installedAt?: string | null;
  autoUpdate?: boolean;
  uiUrl?: string;
  manifest?: PluginManifest;
  installedVersion?: string | null;
}

export interface TenantPluginResponse {
  plugins: TenantPluginInfo[];
}
