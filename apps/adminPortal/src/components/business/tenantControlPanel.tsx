import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { type TenantItem } from '@nodeadmin/shared-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { TenantFormDialog } from './tenantFormDialog';

export function TenantControlPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();

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
      await deleteMutation.mutateAsync(deleteTenant.id);
      setDeleteTenant(undefined);
    }
  };

  const tenants = Array.isArray(tenantQuery.data) ? tenantQuery.data : [];

  return (
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'tenant.title' })}</CardTitle>
            <CardDescription>{t({ id: 'tenant.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreateFormOpen(true)}>
            {t({ id: 'tenant.create' })}
          </Button>
        </CardHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ id: 'tenant.colName' })}</TableHead>
              <TableHead>{t({ id: 'tenant.colStatus' })}</TableHead>
              <TableHead>{t({ id: 'tenant.colActions' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenantQuery.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow className="hover:bg-muted/50" key={`tenant-skeleton-${index}`}>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {tenantQuery.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center" colSpan={3}>
                  <p className="text-sm text-destructive">{t({ id: 'tenant.loadFailed' })}</p>
                  <button
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => tenantQuery.refetch()}
                    type="button"
                  >
                    {t({ id: 'common.retry' })}
                  </button>
                </TableCell>
              </TableRow>
            ) : null}

            {!tenantQuery.isLoading && !tenantQuery.isError && tenants.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={3}>
                  {t({ id: 'tenant.empty' })}
                </TableCell>
              </TableRow>
            ) : null}

            {!tenantQuery.isLoading && !tenantQuery.isError
              ? tenants.map((tenant) => (
                  <TableRow className="hover:bg-muted/50" key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell>
                      {tenant.is_active ? (
                        <Badge variant="default">{t({ id: 'tenant.active' })}</Badge>
                      ) : (
                        <Badge variant="outline">{t({ id: 'tenant.inactive' })}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          className="text-sm text-primary hover:underline"
                          onClick={() => setEditTenant(tenant)}
                          type="button"
                        >
                          {t({ id: 'tenant.edit' })}
                        </button>
                        <button
                          className="text-sm text-destructive hover:underline"
                          onClick={() => setDeleteTenant(tenant)}
                          type="button"
                        >
                          {t({ id: 'tenant.delete' })}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </Card>

      <TenantFormDialog
        onClose={() => {
          setCreateFormOpen(false);
          setEditTenant(undefined);
        }}
        onSaved={() => tenantQuery.refetch()}
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
