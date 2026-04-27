import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/ui/dataTable';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { type UserItem, type PaginatedResponse } from '@nodeadmin/shared-types';
import { UserFormDialog } from './userFormDialog';

const PAGE_SIZE = 10;

export function UserManagementPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const canManage = usePermissionStore((s) => s.hasPermission('users:manage'));
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | undefined>(undefined);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const usersQuery = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<UserItem>>(
        `/api/v1/users?pageSize=${PAGE_SIZE}&page=${page + 1}&search=${encodeURIComponent(search)}`,
      ),
    queryKey: ['users', page, search],
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: string) => apiClient.del<{ success: boolean }>(`/api/v1/users/${userId}`),
    onSuccess: () => {
      usersQuery.refetch();
      setShowDeleteDialog(false);
      setSelectedUserId(null);
      toast.success(t({ id: 'users.deleteSuccess' }));
    },
    onError: () => {
      toast.error(t({ id: 'users.deleteFailed' }));
    },
  });

  const handleDelete = () => {
    if (selectedUserId) {
      deleteMutation.mutate(selectedUserId);
    }
  };

  const openEditDialog = (user: UserItem) => {
    setEditingUser(user);
    setShowCreateDialog(true);
  };

  const closeDialog = () => {
    setShowCreateDialog(false);
    setEditingUser(undefined);
  };

  const openDeleteConfirm = (userId: string) => {
    setSelectedUserId(userId);
    setShowDeleteDialog(true);
  };

  const users = usersQuery.data?.items ?? [];
  const total = usersQuery.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <section className="relative h-full overflow-y-auto pb-20 md:pb-0">
      <Card className="p-4">
        <CardHeader className="mb-4 flex flex-col items-start justify-between gap-4 p-0 md:flex-row md:items-center md:space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'users.title' })}</CardTitle>
            <CardDescription>{t({ id: 'users.desc' })}</CardDescription>
          </div>
          {canManage && (
            <Button
              className="hidden h-11 w-full md:flex md:h-9 md:w-auto"
              onClick={() => setShowCreateDialog(true)}
              size="sm"
            >
              {t({ id: 'users.create' })}
            </Button>
          )}
        </CardHeader>

        <div className="mb-4">
          <Input
            className="h-11 w-full md:h-9 md:w-64"
            placeholder={t({ id: 'users.search' })}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <DataTable<UserItem>
          columns={[
            {
              header: t({ id: 'users.colEmail' }),
              cell: (user) => <span className="font-medium">{user.email}</span>,
            },
            {
              header: t({ id: 'users.colName' }),
              cell: (user) => user.name,
              className: 'hidden sm:table-cell',
            },
            {
              header: t({ id: 'users.colRoles' }),
              className: 'hidden md:table-cell',
              cell: (user) =>
                user.roles.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role: { id: string; name: string }) => (
                      <Badge key={role.id} variant="secondary">
                        {role.name}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">-</span>
                ),
            },
            {
              header: t({ id: 'users.colStatus' }),
              className: 'hidden sm:table-cell',
              cell: (user) => (
                <Badge variant={user.is_active ? 'default' : 'secondary'}>
                  {user.is_active ? t({ id: 'users.active' }) : t({ id: 'users.inactive' })}
                </Badge>
              ),
            },
            {
              header: t({ id: 'users.colActions' }),
              className: 'text-right',
              cell: (user) => (
                <div className="flex flex-col items-end gap-1 md:flex-row md:justify-end md:gap-3">
                  {canManage && (
                    <>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-primary hover:underline"
                        onClick={() => openEditDialog(user)}
                        type="button"
                      >
                        {t({ id: 'users.edit' })}
                      </button>
                      <button
                        className="flex min-h-11 min-w-11 items-center justify-center text-sm text-destructive hover:underline disabled:text-muted-foreground disabled:cursor-not-allowed"
                        disabled={deleteMutation.isPending}
                        onClick={() => openDeleteConfirm(user.id)}
                        type="button"
                      >
                        {t({ id: 'users.delete' })}
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          data={users}
          emptyMessage={t({ id: 'users.empty' })}
          errorMessage={t({ id: 'users.loadFailed' })}
          isError={usersQuery.isError}
          isLoading={usersQuery.isLoading}
          onRetry={() => usersQuery.refetch()}
          retryLabel={t({ id: 'common.retry' })}
          rowKey={(user) => user.id}
          pagination={
            totalPages > 0
              ? {
                  page,
                  totalPages,
                  onPageChange: setPage,
                  pageInfo: t({ id: 'users.pageInfo' }, { page: page + 1, total: totalPages }),
                  prevLabel: t({ id: 'users.prev' }),
                  nextLabel: t({ id: 'users.next' }),
                }
              : undefined
          }
        />
      </Card>

      {canManage && (
        <div className="fixed bottom-0 left-0 right-0 border-t bg-background p-4 md:hidden">
          <Button className="h-11 w-full" onClick={() => setShowCreateDialog(true)}>
            {t({ id: 'users.create' })}
          </Button>
        </div>
      )}

      <UserFormDialog
        key={editingUser?.id ?? 'create'}
        onClose={closeDialog}
        onSaved={() => {
          closeDialog();
          usersQuery.refetch();
          toast.success(t({ id: 'users.saveSuccess' }));
        }}
        open={showCreateDialog}
        user={editingUser}
      />

      <ConfirmDialog
        message={t({ id: 'users.deleteConfirm' })}
        onClose={() => {
          setShowDeleteDialog(false);
          setSelectedUserId(null);
        }}
        onConfirm={handleDelete}
        open={showDeleteDialog}
        title={t({ id: 'users.deleteTitle' })}
      />
    </section>
  );
}
