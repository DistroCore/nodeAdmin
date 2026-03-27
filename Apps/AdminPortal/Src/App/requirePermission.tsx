import { ReactNode } from 'react';
import { useIntl } from 'react-intl';
import type { AppPermission } from '@nodeadmin/shared-types';
import { usePermissionStore } from '@/Stores/usePermissionStore';

interface RequirePermissionProps {
  children: ReactNode;
  permission: AppPermission;
}

export function RequirePermission({ children, permission }: RequirePermissionProps): JSX.Element {
  const hasPermission = usePermissionStore((state) => state.hasPermission(permission));
  const { formatMessage: t } = useIntl();

  if (!hasPermission) {
    return (
      <section className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {t({ id: 'permission.denied' }, { permission })}
      </section>
    );
  }

  return <>{children}</>;
}
