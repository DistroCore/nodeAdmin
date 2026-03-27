-- 0016: RBAC / Admin Platform Tables

-- tenants
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name VARCHAR(200) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  logo VARCHAR(500),
  is_active INTEGER NOT NULL DEFAULT 1,
  config_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- users
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  avatar VARCHAR(500),
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_tenant_email_uniq ON users (tenant_id, email);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

-- roles
CREATE TABLE IF NOT EXISTS roles (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id VARCHAR(128) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_tenant_name_uniq ON roles (tenant_id, name);
CREATE INDEX IF NOT EXISTS roles_tenant_idx ON roles (tenant_id);

-- permissions
CREATE TABLE IF NOT EXISTS permissions (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  code VARCHAR(100) NOT NULL UNIQUE,
  name VARCHAR(200) NOT NULL,
  module VARCHAR(50) NOT NULL,
  description TEXT
);

-- user_roles
CREATE TABLE IF NOT EXISTS user_roles (
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  PRIMARY KEY (user_id, role_id)
);

-- role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  permission_id VARCHAR(128) NOT NULL REFERENCES permissions(id),
  PRIMARY KEY (role_id, permission_id)
);

-- menus
CREATE TABLE IF NOT EXISTS menus (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  parent_id VARCHAR(128),
  name VARCHAR(100) NOT NULL,
  path VARCHAR(200),
  icon VARCHAR(100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  permission_code VARCHAR(100),
  is_visible INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS menus_parent_idx ON menus (parent_id);

-- role_menus
CREATE TABLE IF NOT EXISTS role_menus (
  role_id VARCHAR(128) NOT NULL REFERENCES roles(id),
  menu_id VARCHAR(128) NOT NULL REFERENCES menus(id),
  PRIMARY KEY (role_id, menu_id)
);

-- oauth_accounts
CREATE TABLE IF NOT EXISTS oauth_accounts (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR(128) NOT NULL REFERENCES users(id),
  provider VARCHAR(50) NOT NULL,
  provider_id VARCHAR(255) NOT NULL,
  access_token TEXT,
  refresh_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oauth_provider_uniq ON oauth_accounts (provider, provider_id);

-- sms_codes
CREATE TABLE IF NOT EXISTS sms_codes (
  id VARCHAR(128) PRIMARY KEY DEFAULT gen_random_uuid()::text,
  phone VARCHAR(20) NOT NULL,
  code VARCHAR(6) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sms_phone_idx ON sms_codes (phone, created_at);
