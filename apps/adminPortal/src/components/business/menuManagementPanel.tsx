import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { MenuItem } from '@nodeadmin/shared-types';
import { MenuFormDialog } from './menuFormDialog';

interface TreeNode {
  id: string;
  level: number;
  menu: MenuItem;
}

function buildTree(menus: MenuItem[]): TreeNode[] {
  const menuMap = new Map<string, MenuItem>();
  menus.forEach((menu) => menuMap.set(menu.id, menu));

  const rootMenus = menus.filter((m) => !m.parent_id);
  const result: TreeNode[] = [];

  function traverse(menu: MenuItem, level: number): void {
    result.push({ id: menu.id, level, menu });
    const children = menus.filter((m) => m.parent_id === menu.id);
    children.sort((a, b) => a.sort_order - b.sort_order);
    children.forEach((child) => traverse(child, level + 1));
  }

  rootMenus.sort((a, b) => a.sort_order - b.sort_order);
  rootMenus.forEach((menu) => traverse(menu, 0));

  return result;
}

export function MenuManagementPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const [editingMenu, setEditingMenu] = useState<MenuItem | undefined>(undefined);
  const [childParentId, setChildParentId] = useState<string | undefined>(undefined);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | undefined>(undefined);

  const menusQuery = useQuery({
    queryFn: () => apiClient.get<MenuItem[]>('/api/v1/menus'),
    queryKey: ['menus'],
  });

  const deleteMutation = useMutation({
    mutationFn: (menuId: string) => apiClient.del<{ success: boolean }>(`/api/v1/menus/${menuId}`),
    onSuccess: () => {
      menusQuery.refetch();
      setShowDeleteDialog(false);
      setDeleteTarget(undefined);
      toast.success(t({ id: 'menus.deleteSuccess' }));
    },
    onError: () => {
      toast.error(t({ id: 'menus.deleteFailed' }));
    },
  });

  const handleDelete = () => {
    if (deleteTarget) {
      deleteMutation.mutate(deleteTarget.id);
    }
  };

  const openEditDialog = (menu: MenuItem) => {
    setEditingMenu(menu);
    setShowCreateDialog(true);
  };

  const openCreateChildDialog = (parentId: string) => {
    setChildParentId(parentId);
    setShowCreateDialog(true);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingMenu(undefined);
    setChildParentId(undefined);
  };

  const openDeleteConfirm = (menu: MenuItem) => {
    setDeleteTarget(menu);
    setShowDeleteDialog(true);
  };

  const menus = menusQuery.data ?? [];
  const treeNodes = buildTree(menus);

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'menus.title' })}</CardTitle>
            <CardDescription>{t({ id: 'menus.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            {t({ id: 'menus.create' })}
          </Button>
        </CardHeader>

        {menusQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                className="flex animate-pulse items-center gap-4 rounded-md border border-border p-3"
                key={`menu-skeleton-${index}`}
              >
                <div className="h-4 w-1/3 rounded bg-muted" />
                <div className="h-4 w-1/4 rounded bg-muted" />
                <div className="h-4 w-1/6 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : null}

        {menusQuery.isError ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive">{t({ id: 'menus.loadFailed' })}</p>
            <button
              className="mt-2 text-xs text-primary hover:underline"
              onClick={() => menusQuery.refetch()}
              type="button"
            >
              {t({ id: 'common.retry' })}
            </button>
          </div>
        ) : null}

        {!menusQuery.isLoading && !menusQuery.isError && menus.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t({ id: 'menus.empty' })}
          </div>
        ) : null}

        {!menusQuery.isLoading && !menusQuery.isError && menus.length > 0 && (
          <div className="space-y-1">
            {treeNodes.map((node) => (
              <div
                className="flex items-center gap-2 rounded-md border border-border p-2 hover:bg-muted/50"
                key={node.id}
                style={{ paddingLeft: `${node.level * 24 + 8}px` }}
              >
                <div className="flex-1 grid-cols-12 gap-2 text-sm">
                  <div className="col-span-3 font-medium">{node.menu.name}</div>
                  <div className="col-span-3 text-muted-foreground">{node.menu.path}</div>
                  <div className="col-span-2 text-muted-foreground">{node.menu.icon}</div>
                  <div className="col-span-1 text-muted-foreground">{node.menu.sort_order}</div>
                  <div className="col-span-1">
                    <Badge variant={node.menu.is_visible ? 'default' : 'secondary'}>
                      {node.menu.is_visible
                        ? t({ id: 'menus.visible' })
                        : t({ id: 'menus.hidden' })}
                    </Badge>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEditDialog(node.menu)}
                    type="button"
                  >
                    {t({ id: 'menus.edit' })}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openCreateChildDialog(node.menu.id)}
                    type="button"
                  >
                    {t({ id: 'menus.createChild' })}
                  </Button>
                  <Button
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    disabled={deleteMutation.isPending}
                    onClick={() => openDeleteConfirm(node.menu)}
                    size="sm"
                    type="button"
                  >
                    {t({ id: 'menus.delete' })}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <MenuFormDialog
        menu={editingMenu}
        menus={menus}
        onClose={closeDialog}
        onSaved={() => {
          closeDialog();
          menusQuery.refetch();
          toast.success(t({ id: 'menus.saveSuccess' }));
        }}
        parentId={childParentId}
        open={showCreateDialog}
      />

      <ConfirmDialog
        message={t({ id: 'menus.deleteConfirm' })}
        onClose={() => {
          setShowDeleteDialog(false);
          setDeleteTarget(undefined);
        }}
        onConfirm={handleDelete}
        open={showDeleteDialog}
        title={t({ id: 'menus.delete' })}
      />
    </section>
  );
}
