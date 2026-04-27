import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { type RoleItem, type PaginatedResponse } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { className } from '@/lib/className';

interface PermissionItem {
  id: string;
  code: string;
  name: string;
  description: string;
  module: string;
}

interface RoleFormDialogProps {
  open: boolean;
  onClose: () => void;
  role?: RoleItem;
  onSaved: () => void;
}

export function RoleFormDialog({ onClose, onSaved, open, role }: RoleFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();
  const toast = useToast();
  const tenantId = useAuthStore((s) => s.tenantId);

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>(
    role?.permissions.map((p) => p.id) ?? [],
  );

  const isEdit = !!role;

  const permissionsQuery = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<PermissionItem>>(
        `/api/v1/permissions?limit=200&tenantId=${tenantId ?? 'default'}`,
      ),
    queryKey: ['permissions', tenantId],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; description: string; permissionIds: string[]; tenantId: string }) => {
      if (isEdit && role) {
        // Strip tenantId — not in UpdateRoleDto, passed as query param instead
        const { name, description, permissionIds } = data;
        await apiClient.patch(`/api/v1/roles/${role.id}?tenantId=${data.tenantId}`, {
          name,
          description,
          permissionIds,
        });
      } else {
        await apiClient.post('/api/v1/roles', data);
      }
    },
    onSuccess: () => {
      toast.success(t({ id: 'roles.saveSuccess', defaultMessage: 'Role saved successfully' }));
      onSaved();
      handleClose();
    },
    onError: (error: Error) => {
      toast.error(
        t({ id: 'roles.saveFailed', defaultMessage: 'Failed to save role' }),
        error.message || t({ id: 'common.error.unknown' }),
      );
    },
  });

  const permissions = permissionsQuery.data?.items ?? [];

  const groupedPermissions = permissions.reduce<Record<string, PermissionItem[]>>((acc, perm) => {
    if (!acc[perm.module]) {
      acc[perm.module] = [];
    }
    acc[perm.module].push(perm);
    return acc;
  }, {});

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({
      name,
      description,
      permissionIds: selectedPermissionIds,
      tenantId: tenantId ?? 'default',
    });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    setSelectedPermissionIds([]);
    onClose();
  };

  const togglePermission = (id: string) => {
    setSelectedPermissionIds((prev) => (prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]));
  };

  const toggleModule = (modulePerms: PermissionItem[]) => {
    const moduleIds = modulePerms.map((p) => p.id);
    const allSelected = moduleIds.every((id) => selectedPermissionIds.includes(id));

    if (allSelected) {
      setSelectedPermissionIds((prev) => prev.filter((id) => !moduleIds.includes(id)));
    } else {
      setSelectedPermissionIds((prev) => {
        const next = [...prev];
        moduleIds.forEach((id) => {
          if (!next.includes(id)) next.push(id);
        });
        return next;
      });
    }
  };

  return (
    <Dialog onClose={handleClose} open={open} title={t({ id: isEdit ? 'roles.edit' : 'roles.create' })}>
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'roles.fieldName' })} htmlFor="role-name">
            <Input id="role-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>

          <FormField label={t({ id: 'roles.fieldDescription' })} htmlFor="role-description">
            <Input
              id="role-description"
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </FormField>

          <FormField label={t({ id: 'roles.fieldPermissions' })}>
            {permissionsQuery.isLoading ? (
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
                {t({ id: 'roles.loadingPermissions' })}
              </div>
            ) : (
              <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border bg-muted/5 p-4">
                {Object.entries(groupedPermissions).map(([module, modulePerms]) => {
                  const isModuleAllSelected = modulePerms.every((p) => selectedPermissionIds.includes(p.id));
                  return (
                    <div key={module} className="space-y-2">
                      <div className="flex items-center justify-between border-b border-border/50 pb-1">
                        <span className="text-xs font-bold uppercase tracking-wider text-primary">{module}</span>
                        <button
                          type="button"
                          onClick={() => toggleModule(modulePerms)}
                          className="text-[0.625rem] font-bold text-muted-foreground hover:text-primary transition-colors"
                        >
                          {isModuleAllSelected ? t({ id: 'common.deselectAll' }) : t({ id: 'common.selectAll' })}
                        </button>
                      </div>
                      <div className="grid grid-cols-1 gap-1 pl-1 sm:grid-cols-2">
                        {modulePerms.map((perm) => (
                          <label
                            key={perm.id}
                            className={className(
                              'flex items-center gap-2 rounded-md p-1.5 transition-colors cursor-pointer hover:bg-accent/50',
                              selectedPermissionIds.includes(perm.id) ? 'text-foreground' : 'text-muted-foreground',
                            )}
                          >
                            <input
                              checked={selectedPermissionIds.includes(perm.id)}
                              onChange={() => togglePermission(perm.id)}
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
                            />
                            <span className="text-xs font-medium">{perm.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={saveMutation.isPending} type="button" variant="secondary" onClick={handleClose}>
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? (
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
