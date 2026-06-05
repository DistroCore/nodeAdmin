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

/**
 * A permission code the plugin introduces into the RBAC catalog. The plugin is responsible
 * for seeding the row into the `permissions` table via its own migration; declaring it here
 * lets the sandbox auto-trust the code without it appearing in the core permission allowlist.
 */
export interface PluginManifestPermissionDefinition {
  code: string;
  name: string;
  description?: string;
}

export interface PluginManifestContributes {
  menus?: PluginManifestMenuContribution[];
  routes?: string[];
  permissions?: PluginManifestPermissionDefinition[];
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

// ─── Frontend plugin host contract ───────────────────────────────────
// A plugin UI bundle is loaded at runtime as a separate ESM module. React context is unreliable
// across that module boundary, so the host injects these capabilities as a `host` prop instead.

/** Thin HTTP surface mirroring the host ApiClient — handles auth tokens + tenant headers + refresh. */
export interface PluginHostApiClient {
  get<TResponse>(path: string): Promise<TResponse>;
  post<TResponse>(path: string, body: unknown): Promise<TResponse>;
  put<TResponse>(path: string, body: unknown): Promise<TResponse>;
  patch<TResponse>(path: string, body: unknown): Promise<TResponse>;
  del<TResponse>(path: string): Promise<TResponse>;
}

export interface PluginHostToast {
  success(title: string, description?: string): void;
  error(title: string, description?: string): void;
  info(title: string, description?: string): void;
}

/** Injected into every plugin UI as the `host` prop. The single seam between a plugin and the shell. */
export interface PluginHost {
  /** Shared HTTP client; requests carry the host's auth + tenant context and auto-refresh tokens. */
  apiClient: PluginHostApiClient;
  /** Active tenant id, or null when unauthenticated. */
  tenantId: string | null;
  /** Reuses the shell's RBAC map; pass a permission code the plugin declared or a shareable core one. */
  hasPermission(code: string): boolean;
  /** Surfaces a toast through the shell's notification stack. */
  toast: PluginHostToast;
  /** Formats a message id via the shell's i18n; falls back to the id when unknown. */
  translate(id: string, values?: Record<string, string | number>): string;
}

/** Props the shell passes to a plugin's default-exported UI component. */
export interface PluginComponentProps {
  host: PluginHost;
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
