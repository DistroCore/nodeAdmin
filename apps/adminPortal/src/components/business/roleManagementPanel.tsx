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
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'roles.title' })}</CardTitle>
            <CardDescription>{t({ id: 'roles.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateFormOpen(true)}>
            {t({ id: 'roles.create' })}
          </Button>
        </CardHeader>

        <DataTable<RoleItem>
          columns={[
            { header: t({ id: 'roles.colName' }), cell: (role) => <span className="font-medium">{role.name}</span> },
            { header: t({ id: 'roles.colDescription' }), cell: (role) => role.description },
            {
              header: t({ id: 'roles.colSystem' }),
              cell: (role) =>
                role.is_system ? (
                  <Badge variant="secondary">{t({ id: 'roles.yes' })}</Badge>
                ) : (
                  <Badge variant="outline">{t({ id: 'roles.no' })}</Badge>
                ),
            },
            { header: t({ id: 'roles.colPermissions' }), cell: (role) => role.permissions.length },
            {
              header: t({ id: 'roles.colActions' }),
              cell: (role) => (
                <div className="flex gap-2">
                  <button
                    className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                    disabled={Boolean(role.is_system)}
                    onClick={() => setEditRole(role)}
                    title={role.is_system ? t({ id: 'roles.systemRole' }) : undefined}
                    type="button"
                  >
                    {t({ id: 'roles.edit' })}
                  </button>
                  <button
                    className="text-sm text-destructive hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
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
