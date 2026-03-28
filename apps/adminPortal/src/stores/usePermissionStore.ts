import { create } from 'zustand';
import type { AppPermission } from '@nodeadmin/shared-types';

type PermissionMap = Record<AppPermission, boolean>;

const defaultPermissions: PermissionMap = {
  'im:send': false,
  'im:view': false,
  'menus:manage': false,
  'menus:view': false,
  'overview:view': true,
  'release:view': false,
  'roles:manage': false,
  'roles:view': false,
  'settings:view': false,
  'tenant:view': false,
  'users:manage': false,
  'users:view': false,
};

function buildPermissionMap(roles: string[]): PermissionMap {
  const roleSet = new Set(roles);
  const isAdmin = roleSet.has('admin') || roleSet.has('super-admin');

  return {
    'im:send': isAdmin || roleSet.has('im:operator'),
    'im:view': isAdmin || roleSet.has('im:operator') || roleSet.has('viewer'),
    'menus:manage': isAdmin,
    'menus:view': isAdmin,
    'overview:view': true,
    'release:view': isAdmin || roleSet.has('release:viewer'),
    'roles:manage': isAdmin,
    'roles:view': isAdmin,
    'settings:view': isAdmin,
    'tenant:view': isAdmin || roleSet.has('viewer'),
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
