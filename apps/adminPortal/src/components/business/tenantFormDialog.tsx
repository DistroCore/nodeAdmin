import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useIntl } from 'react-intl';
import { type TenantItem } from '@nodeadmin/shared-types';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Checkbox } from '@/components/ui/checkbox';
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

  const isEdit = !!tenant;

  const saveMutation = useMutation({
    mutationFn: async (data: { name: string; is_active: boolean }) => {
      if (isEdit && tenant) {
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
      title={t({ id: isEdit ? 'tenant.edit' : 'tenant.create' })}
    >
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          <FormField label={t({ id: 'tenant.fieldName' })} htmlFor="tenant-name">
            <Input
              id="tenant-name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>

          <Checkbox
            checked={isActive}
            id="tenant-active"
            label={t({ id: 'tenant.fieldActive' })}
            onChange={setIsActive}
          />
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button disabled={saveMutation.isPending} type="button" variant="secondary" onClick={handleClose}>
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
