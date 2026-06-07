export type ImMessageType = 'file' | 'image' | 'system' | 'text';

export type ImPresenceStatus = 'away' | 'dnd' | 'online';

export interface MessageMetadata {
  fileName?: string;
  fileSizeBytes?: number;
  url?: string;
}

export interface ImMessage {
  content: string;
  conversationId: string;
  createdAt: string;
  deletedAt: string | null;
  editedAt: string | null;
  messageId: string;
  messageType: ImMessageType;
  metadata: MessageMetadata | null;
  sequenceId: number;
  tenantId: string;
  traceId: string;
  userId: string;
}

export interface AuthIdentitySnapshot {
  roles: string[];
  tenantId: string;
  userId: string;
}

export type AppPermission =
  | 'audit:view'
  | 'backlog:manage'
  | 'backlog:view'
  | 'im:send'
  | 'im:view'
  | 'menus:manage'
  | 'menus:view'
  | 'overview:view'
  | 'plugins:manage'
  | 'plugins:view'
  | 'release:view'
  | 'roles:manage'
  | 'roles:view'
  | 'settings:view'
  | 'tenants:manage'
  | 'tenants:view'
  | 'users:manage'
  | 'users:view';

// ─── API Response Types ──────────────────────────────────────────────

/** POST /api/v1/auth/login & /register actual response */
export interface AuthResponse {
  accessToken: string;
  identity: { tenantId: string; userId: string };
  refreshToken: string;
  tokenType: string;
}

export interface UserItem {
  avatar: string | null;
  created_at: string;
  email: string;
  id: string;
  is_active: boolean;
  name: string | null;
  phone: string | null;
  roles: { id: string; name: string }[];
  tenant_id: string;
  updated_at: string;
}

export interface RoleItem {
  created_at: string;
  description: string | null;
  id: string;
  is_system: boolean;
  name: string;
  permissions: { code: string; id: string; name: string }[];
  updated_at: string;
}

export interface PermissionItem {
  code: string;
  description: string | null;
  id: string;
  module: string;
  name: string;
}

export interface MenuItem {
  children: MenuItem[];
  created_at: string;
  icon: string;
  id: string;
  is_visible: boolean;
  name: string;
  parent_id: string | null;
  path: string;
  permission_code: string | null;
  plugin_code: string | null;
  sort_order: number;
}

export interface TenantItem {
  config_json: string | null;
  created_at: string;
  id: string;
  is_active: boolean;
  logo: string | null;
  name: string;
  slug: string;
  updated_at: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditLogItem {
  id: string;
  tenantId: string;
  userId: string;
  actorName?: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetName?: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

// ─── IM Conversation Types ────────────────────────────────────────────

export type ConversationType = 'dm' | 'group';

export type ConversationMemberRole = 'admin' | 'member';

export interface ConversationMember {
  userId: string;
  role: ConversationMemberRole;
  joinedAt: string;
}

export interface ConversationItem {
  id: string;
  tenantId: string;
  type: ConversationType;
  title: string | null;
  creatorId: string | null;
  members: ConversationMember[];
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateConversationRequest {
  type: ConversationType;
  title?: string;
  memberUserIds: string[];
}

// Modernizer analysis types moved into the modernizer dev CLI (apps/coreApi/tools/modernizer),
// which defines them locally — the runtime module + its frontend panel were removed.

// Backlog domain types (BacklogTask / BacklogSprint) now live inside @nodeadmin/plugin-backlog,
// which owns the backlog domain end to end. The backlog:view / backlog:manage permission codes are
// intentionally retained in AppPermission above: the core permission map still delivers them to the
// frontend so the plugin's UI can gate on them.

export * from './plugin';
