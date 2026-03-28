import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { type TenantItem } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useApiClient } from '@/hooks/useApiClient';

interface TenantFormDialogProps {
  open: boolean;
  onClose: () => void;
  tenant?: TenantItem;
  onSaved: () => void;
}

export function TenantFormDialog({
  onClose,
  onSaved,
  open,
  tenant,
}: TenantFormDialogProps): JSX.Element {
  const { formatMessage: t } = useIntl();
  const apiClient = useApiClient();

  const [name, setName] = useState(tenant?.name ?? '');
  const [isActive, setIsActive] = useState(Boolean(tenant?.is_active ?? true));

  const isEditMode = !!tenant;

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; is_active: boolean }) => {
      if (isEditMode && tenant) {
        await apiClient.put(`/api/v1/tenants/${tenant.id}`, data);
      } else {
        await apiClient.post('/api/v1/tenants', data);
      }
    },
    onSuccess: () => {
      onSaved();
      handleClose();
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate({ name, is_active: isActive });
  };

  const handleClose = () => {
    setName(tenant?.name ?? '');
    setIsActive(Boolean(tenant?.is_active ?? true));
    onClose();
  };

  return (
    <Dialog
      onClose={handleClose}
      open={open}
      title={t({ id: isEditMode ? 'tenant.edit' : 'tenant.create' })}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tenant-name">{t({ id: 'tenant.fieldName' })}</Label>
            <Input
              id="tenant-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              checked={isActive}
              id="tenant-active"
              onChange={(e) => setIsActive(e.target.checked)}
              type="checkbox"
            />
            <Label className="cursor-pointer" htmlFor="tenant-active">
              {t({ id: 'tenant.fieldActive' })}
            </Label>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            {t({ id: 'common.cancel' })}
          </Button>
          <Button disabled={saveMutation.isPending} type="submit">
            {saveMutation.isPending ? '...' : t({ id: 'common.save' })}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
