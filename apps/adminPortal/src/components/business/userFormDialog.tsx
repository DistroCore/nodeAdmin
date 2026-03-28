import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiClient } from '@/hooks/useApiClient';
import { type UserItem, type RoleItem, type PaginatedResponse } from '@nodeadmin/shared-types';

interface UserFormDialogProps {
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
  user?: UserItem;
}

interface CreateUserData {
  email: string;
  password: string;
  name: string;
  roleIds: string[];
}

interface UpdateUserData {
  email: string;
  password?: string;
  name: string;
  roleIds: string[];
}

export function UserFormDialog({ onClose, onSaved, open, user }: UserFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const isEdit = user !== undefined;

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(
    new Set(user?.roles.map((r) => r.id) ?? [])
  );

  const rolesQuery = useQuery({
    queryFn: () => apiClient.get<RoleItem[]>('/api/v1/roles'),
    queryKey: ['roles'],
  });

  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data : [];

  const resetForm = () => {
    setEmail(user?.email ?? '');
    setName(user?.name ?? '');
    setPassword('');
    setSelectedRoleIds(new Set(user?.roles.map((r) => r.id) ?? []));
  };

  const handleDialogClose = () => {
    resetForm();
    onClose();
  };

  const handleSaveSuccess = () => {
    resetForm();
    onSaved();
  };

  const createMutation = useMutation({
    mutationFn: (data: CreateUserData) => apiClient.post<UserItem>('/api/v1/users', data),
    onSuccess: handleSaveSuccess,
  });

  const updateMutation = useMutation({
    mutationFn: ({ userId, data }: { userId: string; data: UpdateUserData }) =>
      apiClient.put<UserItem>(`/api/v1/users/${userId}`, data),
    onSuccess: handleSaveSuccess,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const roleIds = Array.from(selectedRoleIds);

    if (isEdit) {
      const data: UpdateUserData = {
        email,
        name,
        roleIds,
      };
      if (password.trim()) {
        data.password = password;
      }
      updateMutation.mutate({ userId: user.id, data });
    } else {
      const data: CreateUserData = {
        email,
        password,
        name,
        roleIds,
      };
      createMutation.mutate(data);
    }
  };

  const toggleRole = (roleId: string) => {
    setSelectedRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) {
        next.delete(roleId);
      } else {
        next.add(roleId);
      }
      return next;
    });
  };

  const isPending = createMutation.isPending || updateMutation.isPending;
  const title = t({ id: isEdit ? 'users.edit' : 'users.create' });

  return (
    <Dialog onClose={handleDialogClose} open={open} title={title}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="user-email">{t({ id: 'auth.email' })}</Label>
            <Input
              id="user-email"
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-password">
              {t({ id: 'auth.password' })}
              {!isEdit && <span className="text-destructive ml-1">*</span>}
            </Label>
            <Input
              id="user-password"
              placeholder={isEdit ? t({ id: 'users.passwordOptional' }) : undefined}
              required={!isEdit}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="user-name">{t({ id: 'auth.name' })}</Label>
            <Input
              id="user-name"
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>{t({ id: 'users.colRoles' })}</Label>
            <div className="max-h-32 overflow-y-auto rounded-md border border-border p-3">
              {rolesQuery.isLoading
                ? t({ id: 'users.loadingRoles' })
                : roles.length === 0
                  ? t({ id: 'users.noRoles' })
                  : roles.map((role) => (
                      <label className="flex items-center gap-2 py-1" key={role.id}>
                        <input
                          checked={selectedRoleIds.has(role.id)}
                          onChange={() => toggleRole(role.id)}
                          type="checkbox"
                        />
                        <span className="text-sm">{role.name}</span>
                      </label>
                    ))}
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            disabled={isPending}
            onClick={handleDialogClose}
            type="button"
            variant="secondary"
          >
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? '...' : t({ id: 'common.save' })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
