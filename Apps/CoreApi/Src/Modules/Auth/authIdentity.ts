export interface AuthIdentity {
  jti: string;
  roles: string[];
  tenantId: string;
  userId: string;
}
