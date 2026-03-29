export type ImMessageType = 'file' | 'image' | 'system' | 'text';

export interface MessageMetadata {
  fileName?: string;
  fileSizeBytes?: number;
  url?: string;
}

export interface ImMessage {
  content: string;
  conversationId: string;
  createdAt: string;
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
  | 'modernizer:view'
  | 'overview:view'
  | 'release:view'
  | 'roles:manage'
  | 'roles:view'
  | 'settings:view'
  | 'tenant:view'
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
  is_active: number;
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
  is_system: number;
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
  is_visible: number;
  name: string;
  parent_id: string | null;
  path: string;
  permission_code: string | null;
  sort_order: number;
}

export interface TenantItem {
  config_json: string | null;
  created_at: string;
  id: string;
  is_active: number;
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
  action: string;
  targetType: string | null;
  targetId: string | null;
  traceId: string;
  context: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Modernizer Types ──────────────────────────────────────────────

export type AnalysisCategory =
  | 'console-log'
  | 'todo'
  | 'missing-validation'
  | 'unused-import';

export type AnalysisSeverity = 'info' | 'warning' | 'error';

export interface AnalysisIssue {
  file: string;
  line: number;
  category: AnalysisCategory;
  message: string;
  severity: AnalysisSeverity;
}

export interface AnalysisSummary {
  total: number;
  byCategory: Record<AnalysisCategory, number>;
}

export interface AnalysisResult {
  issues: AnalysisIssue[];
  summary: AnalysisSummary;
}

// ─── Backlog Types ──────────────────────────────────────────────────

export interface BacklogTask {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee_id: string | null;
  sprint_id: string | null;
  sort_order: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BacklogSprint {
  id: string;
  tenant_id: string;
  name: string;
  goal: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}
