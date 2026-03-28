import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useMutation } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useApiClient } from '@/hooks/useApiClient';
import { MenuItem } from '@nodeadmin/shared-types';

interface MenuFormDialogProps {
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
  menu?: MenuItem;
  parentId?: string;
  menus: MenuItem[];
}

interface CreateMenuData {
  name: string;
  path: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  permission_code: string;
  is_visible: number;
}

interface UpdateMenuData {
  name: string;
  path: string;
  icon: string;
  parent_id: string | null;
  sort_order: number;
  permission_code: string;
  is_visible: number;
}

function flattenMenus(menus: MenuItem[]): MenuItem[] {
  const result: MenuItem[] = [];
  const queue = [...menus];

  while (queue.length > 0) {
    const menu = queue.shift()!;
    result.push(menu);
    if (menu.children && menu.children.length > 0) {
      queue.push(...menu.children);
    }
  }

  return result;
}

function getInitialValues(
  menu: MenuItem | undefined,
  parentId: string | undefined,
  isChildMode: boolean
) {
  return {
    name: menu?.name ?? '',
    path: menu?.path ?? '',
    icon: menu?.icon ?? '',
    selectedParentId: isChildMode ? (parentId ?? null) : (menu?.parent_id ?? null),
    sortOrder: menu?.sort_order ?? 0,
    permissionCode: menu?.permission_code ?? '',
    isVisible: menu ? Boolean(menu.is_visible) : true,
  };
}

export function MenuFormDialog({
  onClose,
  onSaved,
  open,
  menu,
  parentId,
  menus,
}: MenuFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const isEdit = menu !== undefined;
  const isChildMode = parentId !== undefined;

  const initialValues = getInitialValues(menu, parentId, isChildMode);

  const [name, setName] = useState(initialValues.name);
  const [path, setPath] = useState(initialValues.path);
  const [icon, setIcon] = useState(initialValues.icon);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(
    initialValues.selectedParentId
  );
  const [sortOrder, setSortOrder] = useState(initialValues.sortOrder);
  const [permissionCode, setPermissionCode] = useState(initialValues.permissionCode);
  const [isVisible, setIsVisible] = useState(initialValues.isVisible);

  const createMutation = useMutation({
    mutationFn: (data: CreateMenuData) => apiClient.post<MenuItem>('/api/v1/menus', data),
    onSuccess: () => {
      onSaved();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ menuId, data }: { menuId: string; data: UpdateMenuData }) =>
      apiClient.put<MenuItem>(`/api/v1/menus/${menuId}`, data),
    onSuccess: () => {
      onSaved();
    },
  });

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateMenuData | UpdateMenuData = {
      name,
      path,
      icon,
      parent_id: selectedParentId,
      sort_order: sortOrder,
      permission_code: permissionCode,
      is_visible: isVisible ? 1 : 0,
    };

    if (isEdit) {
      updateMutation.mutate({ menuId: menu.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const flattenedMenus = flattenMenus(menus);
  const availableParents = flattenedMenus.filter(
    (m) => m.id !== menu?.id && !isDescendant(menu, m.id, menus)
  );

  function isDescendant(
    parentMenu: MenuItem | undefined,
    potentialChildId: string,
    allMenus: MenuItem[]
  ): boolean {
    if (!parentMenu) return false;
    const children = allMenus.filter((m) => m.parent_id === parentMenu.id);
    if (children.some((c) => c.id === potentialChildId)) return true;
    for (const child of children) {
      if (isDescendant(child, potentialChildId, allMenus)) return true;
    }
    return false;
  }

  const isPending = createMutation.isPending || updateMutation.isPending;
  const title = t({
    id: isChildMode ? 'menus.createChild' : isEdit ? 'menus.edit' : 'menus.create',
  });

  return (
    <Dialog onClose={handleClose} open={open} title={title}>
      <form key={menu?.id ?? (isChildMode ? `child-${parentId}` : 'new')} onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'menus.fieldName' })} htmlFor="menu-name">
            <Input
              id="menu-name"
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'menus.fieldPath' })} htmlFor="menu-path">
            <Input
              id="menu-path"
              required
              type="text"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'menus.fieldIcon' })} htmlFor="menu-icon">
            <Input
              id="menu-icon"
              required
              type="text"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'menus.fieldParent' })} htmlFor="menu-parent">
            <Select
              disabled={isChildMode}
              onChange={(value) => setSelectedParentId(value || null)}
              options={availableParents.map((m) => ({ value: m.id, label: m.name }))}
              placeholder={t({ id: 'menus.noParent' })}
              value={selectedParentId ?? ''}
            />
          </FormField>

          <FormField label={t({ id: 'menus.fieldSort' })} htmlFor="menu-sort">
            <Input
              id="menu-sort"
              required
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number.parseInt(e.target.value) || 0)}
            />
          </FormField>

          <FormField label={t({ id: 'menus.fieldPermission' })} htmlFor="menu-permission">
            <Input
              id="menu-permission"
              required
              type="text"
              value={permissionCode}
              onChange={(e) => setPermissionCode(e.target.value)}
            />
          </FormField>

          <Checkbox
            checked={isVisible}
            id="menu-visible"
            label={t({ id: 'menus.fieldVisible' })}
            onChange={setIsVisible}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={isPending} onClick={handleClose} type="button" variant="secondary">
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? '...' : t({ id: 'common.save' })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
