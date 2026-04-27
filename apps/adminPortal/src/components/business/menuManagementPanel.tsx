import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DataTable } from '@/components/ui/dataTable';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { MenuItem } from '@nodeadmin/shared-types';
import { NavIcon } from '@/app/layout/navIcon';
import { MenuFormDialog } from './menuFormDialog';

interface TreeNode {
  id: string;
  level: number;
  menu: MenuItem;
}

function buildTree(menus: MenuItem[]): TreeNode[] {
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
  const canManage = usePermissionStore((s) => s.hasPermission('menus:manage'));
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

  const handleDelete = async () => {
    if (deleteTarget) {
      try {
        await deleteMutation.mutateAsync(deleteTarget.id);
      } catch {
        // Error handled by mutation onError
      }
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
    <section className="relative h-full overflow-y-auto pb-20 md:pb-0">
      <Card className="p-4">
        <CardHeader className="mb-4 flex flex-col items-start justify-between gap-4 p-0 md:flex-row md:items-center md:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'menus.title' })}</CardTitle>
            <CardDescription>{t({ id: 'menus.desc' })}</CardDescription>
          </div>
          {canManage && (
            <Button
              className="hidden h-11 w-full md:flex md:h-9 md:w-auto"
              onClick={() => setShowCreateDialog(true)}
              size="sm"
            >
              {t({ id: 'menus.create' })}
            </Button>
          )}
        </CardHeader>

        <DataTable<TreeNode>
          columns={[
            {
              header: t({ id: 'menus.colName' }),
              cell: (node) => (
                <div className="flex items-center gap-2" style={{ paddingLeft: `${node.level * 20}px` }}>
                  <NavIcon name={node.menu.icon} />
                  <span className="font-medium">{node.menu.name}</span>
                </div>
              ),
            },
            {
              header: t({ id: 'menus.colPath' }),
              cell: (node) => <span className="font-mono text-xs text-muted-foreground">{node.menu.path}</span>,
              className: 'hidden md:table-cell',
            },
            {
              header: t({ id: 'menus.colSort' }),
              cell: (node) => <span className="text-muted-foreground">{node.menu.sort_order}</span>,
              className: 'hidden sm:table-cell w-16 text-center',
            },
            {
              header: t({ id: 'menus.colVisible' }),
              cell: (node) => (
                <Badge variant={node.menu.is_visible ? 'default' : 'secondary'}>
                  {node.menu.is_visible ? t({ id: 'menus.visible' }) : t({ id: 'menus.hidden' })}
                </Badge>
              ),
              className: 'hidden sm:table-cell w-20 text-center',
            },
            {
              header: t({ id: 'menus.colActions' }),
              className: 'text-right',
              cell: (node) => (
                <div className="flex flex-col items-end gap-1 md:flex-row md:justify-end md:gap-3">
                  {canManage && (
                    <>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-primary hover:underline"
                        onClick={() => openEditDialog(node.menu)}
                        type="button"
                      >
                        {t({ id: 'menus.edit' })}
                      </button>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-primary hover:underline"
                        onClick={() => openCreateChildDialog(node.menu.id)}
                        type="button"
                      >
                        {t({ id: 'menus.createChild' })}
                      </button>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-destructive hover:underline"
                        disabled={deleteMutation.isPending}
                        onClick={() => openDeleteConfirm(node.menu)}
                        type="button"
                      >
                        {t({ id: 'menus.delete' })}
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          data={treeNodes}
          emptyMessage={t({ id: 'menus.empty' })}
          errorMessage={t({ id: 'menus.loadFailed' })}
          isError={menusQuery.isError}
          isLoading={menusQuery.isLoading}
          onRetry={() => menusQuery.refetch()}
          retryLabel={t({ id: 'common.retry' })}
          rowKey={(node) => node.id}
        />
      </Card>

      {canManage && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:hidden">
          <Button className="h-11 w-full" onClick={() => setShowCreateDialog(true)}>
            {t({ id: 'menus.create' })}
          </Button>
        </div>
      )}

      <MenuFormDialog
        key={editingMenu?.id ?? 'create'}
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
