import { create } from 'zustand';
import type { AppPermission } from '@nodeadmin/shared-types';

type PermissionMap = Record<AppPermission, boolean>;

const defaultPermissions: PermissionMap = {
  'audit:view': false,
  'im:send': false,
  'im:view': false,
  'menus:manage': false,
  'menus:view': false,
  'overview:view': true,
  'plugins:manage': false,
  'plugins:view': false,
  'release:view': false,
  'roles:manage': false,
  'roles:view': false,
  'settings:view': false,
  'tenants:manage': false,
  'tenants:view': false,
  'users:manage': false,
  'users:view': false,
};

function buildPermissionMap(roles: string[]): PermissionMap {
  const roleSet = new Set(roles);
  const isAdmin = roleSet.has('admin') || roleSet.has('super-admin');

  return {
    'audit:view': isAdmin || roleSet.has('viewer'),
    'im:send': isAdmin || roleSet.has('im:operator'),
    'im:view': isAdmin || roleSet.has('im:operator') || roleSet.has('viewer'),
    'menus:manage': isAdmin,
    'menus:view': isAdmin,
    'overview:view': true,
    'plugins:manage': isAdmin,
    'plugins:view': isAdmin,
    'release:view': isAdmin || roleSet.has('release:viewer'),
    'roles:manage': isAdmin,
    'roles:view': isAdmin,
    'settings:view': isAdmin,
    'tenants:manage': isAdmin,
    'tenants:view': isAdmin || roleSet.has('viewer'),
    'users:manage': isAdmin,
    'users:view': isAdmin,
  };
}

export interface PermissionState {
  // Accepts core AppPermission codes and dynamic plugin codes (e.g. 'backlog:manage') alike.
  hasPermission: (permission: AppPermission | string) => boolean;
  permissions: PermissionMap;
  // Plugin-contributed permission codes the user has been granted, delivered from the DB
  // (GET /api/v1/permissions/me/plugins). Core has no compile-time knowledge of these codes.
  pluginPermissions: Set<string>;
  roles: string[];
  setPermissionsFromRoles: (roles: string[]) => void;
  setPermissionSnapshot: (permissions: Partial<PermissionMap>) => void;
  setPluginPermissions: (codes: string[]) => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  hasPermission: (permission) => {
    const map = get().permissions;
    if (permission in map) {
      return Boolean(map[permission as AppPermission]);
    }
    return get().pluginPermissions.has(permission);
  },
  permissions: defaultPermissions,
  pluginPermissions: new Set<string>(),
  roles: [],
  setPermissionsFromRoles: (roles) => {
    const normalizedRoles = roles.map((role) => role.trim()).filter((role) => role.length > 0);

    set({
      permissions: buildPermissionMap(normalizedRoles),
      roles: normalizedRoles,
    });
  },
  setPermissionSnapshot: (permissions) => {
    set((state) => ({
      permissions: {
        ...state.permissions,
        ...permissions,
      },
    }));
  },
  setPluginPermissions: (codes) => {
    set({ pluginPermissions: new Set(codes) });
  },
}));
