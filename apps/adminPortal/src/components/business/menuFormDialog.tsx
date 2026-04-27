import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useMutation } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/toast';
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

interface MenuData {
  name: string;
  path: string;
  icon: string;
  parentId: string | null;
  sortOrder: number;
  permissionCode: string;
  isVisible: boolean;
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

function getInitialValues(menu: MenuItem | undefined, parentId: string | undefined, isChildMode: boolean) {
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

export function MenuFormDialog({ onClose, onSaved, open, menu, parentId, menus }: MenuFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const isEdit = menu !== undefined;
  const isChildMode = parentId !== undefined;

  const initialValues = getInitialValues(menu, parentId, isChildMode);

  const [name, setName] = useState(initialValues.name);
  const [path, setPath] = useState(initialValues.path);
  const [icon, setIcon] = useState(initialValues.icon);
  const [selectedParentId, setSelectedParentId] = useState<string | null>(initialValues.selectedParentId);
  const [sortOrder, setSortOrder] = useState(initialValues.sortOrder);
  const [permissionCode, setPermissionCode] = useState(initialValues.permissionCode);
  const [isVisible, setIsVisible] = useState(initialValues.isVisible);

  const saveMutation = useMutation({
    mutationFn: async (data: MenuData) => {
      if (isEdit && menu) {
        await apiClient.patch<MenuItem>(`/api/v1/menus/${menu.id}`, data);
      } else {
        await apiClient.post<MenuItem>('/api/v1/menus', data);
      }
    },
    onSuccess: () => {
      toast.success(t({ id: 'menus.saveSuccess', defaultMessage: 'Menu saved successfully' }));
      onSaved();
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'menus.saveFailed', defaultMessage: 'Failed to save menu' }),
        error.message || t({ id: 'common.error.unknown' }),
      );
    },
  });

  const handleClose = () => {
    setName(initialValues.name);
    setPath(initialValues.path);
    setIcon(initialValues.icon);
    setSelectedParentId(initialValues.selectedParentId);
    setSortOrder(initialValues.sortOrder);
    setPermissionCode(initialValues.permissionCode);
    setIsVisible(initialValues.isVisible);
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const data: MenuData = {
      name,
      path,
      icon,
      parentId: selectedParentId,
      sortOrder,
      permissionCode,
      isVisible,
    };

    saveMutation.mutate(data);
  };

  const flattenedMenus = flattenMenus(menus);
  const availableParents = flattenedMenus.filter((m) => m.id !== menu?.id && !isDescendant(menu, m.id, menus));

  function isDescendant(parentMenu: MenuItem | undefined, potentialChildId: string, allMenus: MenuItem[]): boolean {
    if (!parentMenu) return false;
    const children = allMenus.filter((m) => m.parent_id === parentMenu.id);
    if (children.some((c) => c.id === potentialChildId)) return true;
    for (const child of children) {
      if (isDescendant(child, potentialChildId, allMenus)) return true;
    }
    return false;
  }

  const isPending = saveMutation.isPending;
  const title = t({
    id: isChildMode ? 'menus.createChild' : isEdit ? 'menus.edit' : 'menus.create',
  });

  return (
    <Dialog onClose={handleClose} open={open} title={title}>
      <form key={menu?.id ?? (isChildMode ? `child-${parentId}` : 'new')} onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'menus.fieldName' })} htmlFor="menu-name">
            <Input id="menu-name" required type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          <FormField label={t({ id: 'menus.fieldPath' })} htmlFor="menu-path">
            <Input id="menu-path" required type="text" value={path} onChange={(e) => setPath(e.target.value)} />
          </FormField>

          <FormField label={t({ id: 'menus.fieldIcon' })} htmlFor="menu-icon">
            <Input id="menu-icon" required type="text" value={icon} onChange={(e) => setIcon(e.target.value)} />
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
            {isPending ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t({ id: 'common.saving' })}
              </>
            ) : (
              t({ id: 'common.save' })
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
