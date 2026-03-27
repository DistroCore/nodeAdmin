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
  | 'im:send'
  | 'im:view'
  | 'overview:view'
  | 'release:view'
  | 'settings:view'
  | 'tenant:view';
