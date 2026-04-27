import { create } from 'zustand';
import type { AppPermission } from '@nodeadmin/shared-types';

type PermissionMap = Record<AppPermission, boolean>;

const defaultPermissions: PermissionMap = {
  'audit:view': false,
  'backlog:manage': false,
  'backlog:view': false,
  'im:send': false,
  'im:view': false,
  'menus:manage': false,
  'menus:view': false,
  'modernizer:view': false,
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
    'backlog:manage': isAdmin,
    'backlog:view': isAdmin || roleSet.has('viewer'),
    'im:send': isAdmin || roleSet.has('im:operator'),
    'im:view': isAdmin || roleSet.has('im:operator') || roleSet.has('viewer'),
    'menus:manage': isAdmin,
    'menus:view': isAdmin,
    'modernizer:view': isAdmin,
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

interface PermissionState {
  hasPermission: (permission: AppPermission) => boolean;
  permissions: PermissionMap;
  roles: string[];
  setPermissionsFromRoles: (roles: string[]) => void;
  setPermissionSnapshot: (permissions: Partial<PermissionMap>) => void;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  hasPermission: (permission) => {
    return Boolean(get().permissions[permission]);
  },
  permissions: defaultPermissions,
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
}));
