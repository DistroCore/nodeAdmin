// Fallback tenant for requests that arrive without an explicit tenant id. Mirrors the core default
// so behaviour is unchanged after the module moved out of coreApi.
export const DEFAULT_TENANT_ID = 'default';

export const DEFAULT_DATABASE_URL = 'postgres://nodeadmin:nodeadmin@localhost:55432/nodeadmin';
