import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { type RoleItem } from '@nodeadmin/shared-types';
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

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ id: 'roles.colName' })}</TableHead>
              <TableHead>{t({ id: 'roles.colDescription' })}</TableHead>
              <TableHead>{t({ id: 'roles.colSystem' })}</TableHead>
              <TableHead>{t({ id: 'roles.colPermissions' })}</TableHead>
              <TableHead>{t({ id: 'roles.colActions' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rolesQuery.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow className="hover:bg-muted/50" key={`role-skeleton-${index}`}>
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
                    <TableCell>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {rolesQuery.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center" colSpan={5}>
                  <p className="text-sm text-destructive">{t({ id: 'roles.loadFailed' })}</p>
                  <button
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => rolesQuery.refetch()}
                    type="button"
                  >
                    {t({ id: 'common.retry' })}
                  </button>
                </TableCell>
              </TableRow>
            ) : null}

            {!rolesQuery.isLoading && !rolesQuery.isError && roles.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>
                  {t({ id: 'roles.empty' })}
                </TableCell>
              </TableRow>
            ) : null}

            {!rolesQuery.isLoading && !rolesQuery.isError
              ? roles.map((role) => (
                  <TableRow className="hover:bg-muted/50" key={role.id}>
                    <TableCell className="font-medium">{role.name}</TableCell>
                    <TableCell>{role.description}</TableCell>
                    <TableCell>
                      {role.is_system ? (
                        <Badge variant="secondary">{t({ id: 'roles.yes' })}</Badge>
                      ) : (
                        <Badge variant="outline">{t({ id: 'roles.no' })}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{role.permissions.length}</TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <button
                          className="text-sm text-primary hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                          disabled={Boolean(role.is_system)}
                          onClick={() => setEditRole(role)}
                          title={role.is_system ? t({ id: 'roles.systemRoleLocked' }) : undefined}
                          type="button"
                        >
                          {t({ id: 'roles.edit' })}
                        </button>
                        <button
                          className="text-sm text-destructive hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                          disabled={Boolean(role.is_system)}
                          onClick={() => setDeleteRole(role)}
                          title={role.is_system ? t({ id: 'roles.systemRoleLocked' }) : undefined}
                          type="button"
                        >
                          {t({ id: 'roles.delete' })}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </Card>

      <RoleFormDialog
        onClose={() => {
          setCreateFormOpen(false);
          setEditRole(undefined);
        }}
        onSaved={() => rolesQuery.refetch()}
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
