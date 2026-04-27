import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { className } from '@/lib/className';
import type { UserItem, RoleItem } from '@nodeadmin/shared-types';

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
  tenantId: string;
}

interface UpdateUserData {
  email: string;
  password?: string;
  name: string;
  roleIds: string[];
  isActive: boolean;
  avatar?: string;
}

export function UserFormDialog({ onClose, onSaved, open, user }: UserFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const tenantId = useAuthStore((s) => s.tenantId);
  const isEdit = user !== undefined;

  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [name, setName] = useState(user?.name ?? '');
  const [isActive, setIsActive] = useState(Boolean(user?.is_active ?? true));
  const [selectedRoleIds, setSelectedRoleIds] = useState<Set<string>>(new Set(user?.roles.map((r) => r.id) ?? []));

  const rolesQuery = useQuery({
    queryFn: () => apiClient.get<RoleItem[]>(`/api/v1/roles?tenantId=${tenantId ?? 'default'}`),
    queryKey: ['roles', tenantId],
  });

  const roles = Array.isArray(rolesQuery.data) ? rolesQuery.data : [];

  const resetForm = () => {
    setEmail(user?.email ?? '');
    setName(user?.name ?? '');
    setPassword('');
    setIsActive(Boolean(user?.is_active ?? true));
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

  const saveMutation = useMutation({
    mutationFn: async (data: CreateUserData | UpdateUserData) => {
      if (isEdit && user) {
        // Only send fields defined in UpdateUserDto (name, avatar, isActive, roleIds).
        // email and password are NOT in the DTO — sending them causes 400.
        const patchData: Record<string, unknown> = {};
        if (data.name !== undefined) patchData.name = data.name;
        if ('avatar' in data && data.avatar !== undefined) patchData.avatar = data.avatar;
        if ('isActive' in data && data.isActive !== undefined) patchData.isActive = data.isActive;
        if ('roleIds' in data && data.roleIds !== undefined) patchData.roleIds = data.roleIds;
        await apiClient.patch<UserItem>(`/api/v1/users/${user.id}?tenantId=${tenantId ?? 'default'}`, patchData);
      } else {
        await apiClient.post<UserItem>('/api/v1/users', data);
      }
    },
    onSuccess: () => {
      toast.success(t({ id: 'users.saveSuccess', defaultMessage: 'User saved successfully' }));
      handleSaveSuccess();
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'users.saveFailed', defaultMessage: 'Failed to save user' }),
        error.message || t({ id: 'common.error.unknown' }),
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const roleIds = Array.from(selectedRoleIds);

    if (isEdit) {
      const data: UpdateUserData = {
        email,
        name,
        roleIds,
        isActive,
      };
      if (password.trim()) {
        data.password = password;
      }
      saveMutation.mutate(data);
    } else {
      const data: CreateUserData = {
        email,
        password,
        name,
        roleIds,
        tenantId: tenantId ?? 'default',
      };
      saveMutation.mutate(data);
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

  const isPending = saveMutation.isPending;
  const title = t({ id: isEdit ? 'users.edit' : 'users.create' });

  return (
    <Dialog onClose={handleDialogClose} open={open} title={title}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'auth.email' })} htmlFor="user-email">
            <Input id="user-email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>

          <FormField
            label={
              <>
                {t({ id: 'auth.password' })}
                {!isEdit && <span className="text-destructive ml-1">*</span>}
              </>
            }
            htmlFor="user-password"
          >
            <Input
              id="user-password"
              placeholder={isEdit ? t({ id: 'users.passwordOptional' }) : undefined}
              required={!isEdit}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'auth.name' })} htmlFor="user-name">
            <Input id="user-name" required type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          {isEdit && (
            <div className="flex items-center gap-2 py-2">
              <input
                id="user-active"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                type="checkbox"
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
              />
              <label htmlFor="user-active" className="text-sm font-medium cursor-pointer">
                {t({ id: 'users.active' })}
              </label>
            </div>
          )}

          <FormField label={t({ id: 'users.colRoles' })}>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-border bg-muted/10 p-3">
              {rolesQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t({ id: 'users.loadingRoles' })}
                </div>
              ) : roles.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 italic">{t({ id: 'users.noRoles' })}</p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {roles.map((role) => (
                    <label
                      className={className(
                        'flex items-center gap-3 rounded-md border border-transparent p-2 transition-all cursor-pointer hover:bg-accent/50',
                        selectedRoleIds.has(role.id) ? 'bg-primary/5 border-primary/20' : '',
                      )}
                      key={role.id}
                    >
                      <input
                        checked={selectedRoleIds.has(role.id)}
                        className="h-4 w-4 rounded border-border text-primary focus:ring-primary/20"
                        onChange={() => toggleRole(role.id)}
                        type="checkbox"
                      />
                      <span
                        className={className(
                          'text-sm font-medium',
                          selectedRoleIds.has(role.id) ? 'text-primary' : 'text-muted-foreground',
                        )}
                      >
                        {role.name}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={isPending} onClick={handleDialogClose} type="button" variant="secondary">
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={isPending} type="submit">
            {isPending ? (
              <>
                <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t({ id: 'common.saving' })}
              </>
            ) : (
              t({ id: 'common.save' })
            )}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
