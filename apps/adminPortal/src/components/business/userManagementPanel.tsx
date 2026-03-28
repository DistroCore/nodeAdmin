import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { type UserItem, type PaginatedResponse } from '@nodeadmin/shared-types';
import { UserFormDialog } from './userFormDialog';

const PAGE_SIZE = 10;

export function UserManagementPanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserItem | undefined>(undefined);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const usersQuery = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<UserItem>>(
        `/api/v1/users?pageSize=${PAGE_SIZE}&page=${page + 1}&search=${encodeURIComponent(search)}`
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
    <section className="h-full overflow-y-auto">
      <Card className="p-4">
        <CardHeader className="mb-4 flex-row items-start justify-between space-y-0 p-0">
          <div className="space-y-1.5">
            <CardTitle className="text-base">{t({ id: 'users.title' })}</CardTitle>
            <CardDescription>{t({ id: 'users.desc' })}</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            {t({ id: 'users.create' })}
          </Button>
        </CardHeader>

        <div className="mb-4">
          <Input
            placeholder={t({ id: 'users.searchPlaceholder' })}
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ id: 'users.colEmail' })}</TableHead>
              <TableHead>{t({ id: 'users.colName' })}</TableHead>
              <TableHead>{t({ id: 'users.colRoles' })}</TableHead>
              <TableHead>{t({ id: 'users.colStatus' })}</TableHead>
              <TableHead>{t({ id: 'users.colActions' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isLoading
              ? Array.from({ length: 3 }).map((_, index) => (
                  <TableRow className="hover:bg-muted/50" key={`user-skeleton-${index}`}>
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

            {usersQuery.isError ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center" colSpan={5}>
                  <p className="text-sm text-destructive">{t({ id: 'users.loadFailed' })}</p>
                  <button
                    className="mt-2 text-xs text-primary hover:underline"
                    onClick={() => usersQuery.refetch()}
                    type="button"
                  >
                    {t({ id: 'common.retry' })}
                  </button>
                </TableCell>
              </TableRow>
            ) : null}

            {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell className="py-8 text-center text-sm text-muted-foreground" colSpan={5}>
                  {t({ id: 'users.empty' })}
                </TableCell>
              </TableRow>
            ) : null}

            {!usersQuery.isLoading && !usersQuery.isError
              ? users.map((user: UserItem) => (
                  <TableRow className="hover:bg-muted/50" key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell>{user.name}</TableCell>
                    <TableCell>
                      {user.roles.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role: { id: string; name: string }) => (
                            <Badge key={role.id} variant="secondary">
                              {role.name}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? 'default' : 'secondary'}>
                        {user.is_active
                          ? t({ id: 'users.statusActive' })
                          : t({ id: 'users.statusInactive' })}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => openEditDialog(user)}
                          type="button"
                        >
                          {t({ id: 'users.edit' })}
                        </Button>
                        <Button
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          disabled={deleteMutation.isPending}
                          onClick={() => openDeleteConfirm(user.id)}
                          size="sm"
                          type="button"
                        >
                          {t({ id: 'users.delete' })}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>

        {!usersQuery.isLoading && !usersQuery.isError && totalPages > 0 && (
          <div className="mt-4 flex items-center justify-between">
            <Button
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              size="sm"
              variant="secondary"
            >
              {t({ id: 'users.previous' })}
            </Button>
            <span className="text-sm text-muted-foreground">
              {t({ id: 'users.pageInfo' }, { current: page + 1, total: totalPages })}
            </span>
            <Button
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              size="sm"
              variant="secondary"
            >
              {t({ id: 'users.next' })}
            </Button>
          </div>
        )}
      </Card>

      <UserFormDialog
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
