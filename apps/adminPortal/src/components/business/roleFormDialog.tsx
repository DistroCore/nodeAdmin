import { useMutation, useQuery } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { useState } from 'react';
import { type RoleItem, type PaginatedResponse } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';

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
  const tenantId = useAuthStore((s) => s.tenantId);

  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>(
    role?.permissions.map((p) => p.id) ?? []
  );

  const isEdit = !!role;

  const permissionsQuery = useQuery({
    queryFn: () =>
      apiClient.get<PaginatedResponse<PermissionItem>>(
        `/api/v1/permissions?limit=200&tenantId=${tenantId ?? 'default'}`
      ),
    queryKey: ['permissions', tenantId],
  });

  const saveMutation = useMutation({
    mutationFn: async (data: {
      name: string;
      description: string;
      permissionIds: string[];
      tenantId: string;
    }) => {
      if (isEdit && role) {
        await apiClient.patch(`/api/v1/roles/${role.id}?tenantId=${data.tenantId}`, data);
      } else {
        await apiClient.post('/api/v1/roles', data);
      }
    },
    onSuccess: () => {
      onSaved();
      handleClose();
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
    setSelectedPermissionIds((prev) =>
      prev.includes(id) ? prev.filter((pid) => pid !== id) : [...prev, id]
    );
  };

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      title={t({ id: isEdit ? 'roles.edit' : 'roles.create' })}
    >
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
              <div className="text-sm text-muted-foreground">
                {t({ id: 'roles.loadingPermissions' })}
              </div>
            ) : (
              <div className="max-h-60 space-y-3 overflow-y-auto rounded-md border border-border p-3">
                {Object.entries(groupedPermissions).map(([module, modulePerms]) => (
                  <div key={module}>
                    <div className="mb-2 text-sm font-semibold text-foreground">{module}</div>
                    <div className="space-y-1 pl-2">
                      {modulePerms.map((perm) => (
                        <Checkbox
                          checked={selectedPermissionIds.includes(perm.id)}
                          id={`perm-${perm.id}`}
                          key={perm.id}
                          label={perm.name}
                          onChange={() => togglePermission(perm.id)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormField>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button
            disabled={saveMutation.isPending}
            type="button"
            variant="secondary"
            onClick={handleClose}
          >
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
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
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
