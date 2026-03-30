import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { type RoleItem } from '@nodeadmin/shared-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/dataTable';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { RoleFormDialog } from './roleFormDialog';

export function RoleManagementPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleItem | undefined>();
  const [deleteRole, setDeleteRole] = useState<RoleItem | undefined>();

  const rolesQuery = useQuery({
    queryFn: () => apiClient.get<RoleItem[]>('/api/v1/roles'),
    queryKey: ['roles'],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.del(`/api/v1/roles/${id}`),
    onSuccess: () => {
      rolesQuery.refetch();
      toast.success(t({ id: 'roles.deleteSuccess' }));
    },
    onError: () => {
      toast.error(t({ id: 'roles.deleteFailed' }));
    },
  });

  const handleDeleteConfirm = async () => {
    if (deleteRole) {
      await deleteMutation.mutateAsync(deleteRole.id);
      setDeleteRole(undefined);
    }
  };

  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data : [];

  return (
    <section className="relative h-full overflow-y-auto pb-20 md:pb-0">
      <Card className="p-4">
        <CardHeader className="mb-4 flex flex-col items-start justify-between gap-4 p-0 md:flex-row md:items-center md:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'roles.title' })}</CardTitle>
            <CardDescription>{t({ id: 'roles.desc' })}</CardDescription>
          </div>
          <Button
            className="hidden h-11 w-full md:flex md:h-9 md:w-auto"
            onClick={() => setCreateFormOpen(true)}
            size="sm"
          >
            {t({ id: 'roles.create' })}
          </Button>
        </CardHeader>

        <DataTable<RoleItem>
          columns={[
            { header: t({ id: 'roles.colName' }), cell: (role) => <span className="font-medium">{role.name}</span> },
            {
              header: t({ id: 'roles.colDescription' }),
              cell: (role) => role.description,
              className: 'hidden md:table-cell',
            },
            {
              header: t({ id: 'roles.colSystem' }),
              className: 'hidden sm:table-cell',
              cell: (role) =>
                role.is_system ? (
                  <Badge variant="secondary">{t({ id: 'roles.yes' })}</Badge>
                ) : (
                  <Badge variant="outline">{t({ id: 'roles.no' })}</Badge>
                ),
            },
            {
              header: t({ id: 'roles.colPermissions' }),
              className: 'hidden sm:table-cell',
              cell: (role) => role.permissions.length,
            },
            {
              header: t({ id: 'roles.colActions' }),
              className: 'text-right',
              cell: (role) => (
                <div className="flex flex-col items-end gap-1 md:flex-row md:justify-end md:gap-3">
                  <button
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-primary hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                    disabled={Boolean(role.is_system)}
                    onClick={() => setEditRole(role)}
                    title={role.is_system ? t({ id: 'roles.systemRole' }) : undefined}
                    type="button"
                  >
                    {t({ id: 'roles.edit' })}
                  </button>
                  <button
                    className="flex min-h-[44px] min-w-[44px] items-center justify-center text-sm text-destructive hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                    disabled={Boolean(role.is_system)}
                    onClick={() => setDeleteRole(role)}
                    title={role.is_system ? t({ id: 'roles.systemRole' }) : undefined}
                    type="button"
                  >
                    {t({ id: 'roles.delete' })}
                  </button>
                </div>
              ),
            },
          ]}
          data={roles}
          emptyMessage={t({ id: 'roles.empty' })}
          errorMessage={t({ id: 'roles.loadFailed' })}
          isError={rolesQuery.isError}
          isLoading={rolesQuery.isLoading}
          onRetry={() => rolesQuery.refetch()}
          retryLabel={t({ id: 'common.retry' })}
          rowKey={(role) => role.id}
        />
      </Card>

      <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:hidden">
        <Button className="h-11 w-full" onClick={() => setCreateFormOpen(true)}>
          {t({ id: 'roles.create' })}
        </Button>
      </div>

      <RoleFormDialog
        key={editRole?.id ?? 'create'}
        onClose={() => {
          setCreateFormOpen(false);
          setEditRole(undefined);
        }}
        onSaved={() => {
          rolesQuery.refetch();
          toast.success(t({ id: 'roles.saveSuccess' }));
        }}
        open={createFormOpen || !!editRole}
        role={editRole}
      />

      <ConfirmDialog
        message={t({ id: 'roles.deleteConfirm' }, { name: deleteRole?.name ?? '' })}
        onClose={() => setDeleteRole(undefined)}
        onConfirm={handleDeleteConfirm}
        open={!!deleteRole}
        title={t({ id: 'roles.deleteTitle' })}
      />
    </section>
  );
}
