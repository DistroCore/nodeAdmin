import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { type TenantItem } from '@nodeadmin/shared-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/ui/dataTable';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { TenantFormDialog } from './tenantFormDialog';

export function TenantControlPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const canManage = usePermissionStore((s) => s.hasPermission('tenants:manage'));

  const [createFormOpen, setCreateFormOpen] = useState(false);
  const [editTenant, setEditTenant] = useState<TenantItem | undefined>();
  const [deleteTenant, setDeleteTenant] = useState<TenantItem | undefined>();

  const tenantQuery = useQuery({
    queryFn: () => apiClient.get<TenantItem[]>('/api/v1/tenants'),
    queryKey: ['tenants'],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.del<{ success: boolean }>(`/api/v1/tenants/${id}`),
    onSuccess: () => {
      tenantQuery.refetch();
      toast.success(t({ id: 'tenant.deleteSuccess' }));
    },
    onError: () => {
      toast.error(t({ id: 'tenant.deleteFailed' }));
    },
  });

  const handleDeleteConfirm = async () => {
    if (deleteTenant) {
      try {
        await deleteMutation.mutateAsync(deleteTenant.id);
      } catch {
        // Error handled by mutation onError
      }
      setDeleteTenant(undefined);
    }
  };

  const tenants = Array.isArray(tenantQuery.data) ? tenantQuery.data : [];

  return (
    <section className="relative h-full overflow-y-auto pb-20 md:pb-0">
      <Card className="p-4">
        <CardHeader className="mb-4 flex flex-col items-start justify-between gap-4 p-0 md:flex-row md:items-center md:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'tenant.title' })}</CardTitle>
            <CardDescription>{t({ id: 'tenant.desc' })}</CardDescription>
          </div>
          {canManage && (
            <Button
              className="hidden h-11 w-full md:flex md:h-9 md:w-auto"
              onClick={() => setCreateFormOpen(true)}
              size="sm"
            >
              {t({ id: 'tenant.create' })}
            </Button>
          )}
        </CardHeader>

        <DataTable<TenantItem>
          columns={[
            {
              header: t({ id: 'tenant.colName' }),
              cell: (tenant) => <span className="font-medium">{tenant.name}</span>,
            },
            {
              header: t({ id: 'tenant.colStatus' }),
              className: 'hidden sm:table-cell',
              cell: (tenant) =>
                tenant.is_active ? (
                  <Badge variant="default">{t({ id: 'tenant.active' })}</Badge>
                ) : (
                  <Badge variant="outline">{t({ id: 'tenant.inactive' })}</Badge>
                ),
            },
            {
              header: t({ id: 'tenant.colActions' }),
              className: 'text-right',
              cell: (tenant) => (
                <div className="flex flex-col items-end gap-1 md:flex-row md:justify-end md:gap-3">
                  {canManage && (
                    <>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-primary hover:underline"
                        onClick={() => setEditTenant(tenant)}
                        type="button"
                      >
                        {t({ id: 'tenant.edit' })}
                      </button>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-destructive hover:underline"
                        onClick={() => setDeleteTenant(tenant)}
                        type="button"
                      >
                        {t({ id: 'tenant.delete' })}
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          data={tenants}
          emptyMessage={t({ id: 'tenant.empty' })}
          errorMessage={t({ id: 'tenant.loadFailed' })}
          isError={tenantQuery.isError}
          isLoading={tenantQuery.isLoading}
          onRetry={() => tenantQuery.refetch()}
          retryLabel={t({ id: 'common.retry' })}
          rowKey={(tenant) => tenant.id}
        />
      </Card>

      {canManage && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:hidden">
          <Button className="h-11 w-full" onClick={() => setCreateFormOpen(true)}>
            {t({ id: 'tenant.create' })}
          </Button>
        </div>
      )}

      <TenantFormDialog
        key={editTenant?.id ?? 'create'}
        onClose={() => {
          setCreateFormOpen(false);
          setEditTenant(undefined);
        }}
        onSaved={() => {
          tenantQuery.refetch();
          toast.success(t({ id: 'tenant.saveSuccess' }));
        }}
        open={createFormOpen || !!editTenant}
        tenant={editTenant}
      />

      <ConfirmDialog
        message={t({ id: 'tenant.deleteConfirm' })}
        onClose={() => setDeleteTenant(undefined)}
        onConfirm={handleDeleteConfirm}
        open={!!deleteTenant}
        title={t({ id: 'tenant.delete' })}
      />
    </section>
  );
}
