import { Suspense, useMemo, type ComponentType } from 'react';
import { useIntl } from 'react-intl';
import type { AppPermission, PluginComponentProps, PluginHost } from '@nodeadmin/shared-types';
import { ModuleErrorBoundary } from './moduleErrorBoundary';
import { usePluginLoader } from '@/hooks/usePluginLoader';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/spinner';

interface PluginViewProps {
  pluginName: string;
  uiUrl: string;
}

export function PluginView({ pluginName, uiUrl }: PluginViewProps): JSX.Element {
  const { Component } = usePluginLoader(pluginName, uiUrl);
  const { formatMessage: t } = useIntl();
  const host = usePluginHost();

  if (!Component) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">{t({ id: 'plugin.no_ui' }, { plugin: pluginName })}</p>
      </div>
    );
  }

  // The loader returns an untyped component; the shell guarantees it receives the host prop.
  const PluginComponent = Component as unknown as ComponentType<PluginComponentProps>;

  return (
    <ModuleErrorBoundary>
      <Suspense fallback={<PluginLoadingState />}>
        <PluginComponent host={host} />
      </Suspense>
    </ModuleErrorBoundary>
  );
}

/**
 * Builds the capability object injected into plugin UIs. Passed as a prop (not React context)
 * because plugin bundles load as separate ESM modules where context identity is unreliable.
 */
function usePluginHost(): PluginHost {
  const apiClient = useApiClient();
  const tenantId = useAuthStore((s) => s.tenantId);
  const toast = useToast();
  const { formatMessage } = useIntl();

  return useMemo<PluginHost>(
    () => ({
      apiClient,
      tenantId,
      hasPermission: (code) => usePermissionStore.getState().hasPermission(code as AppPermission),
      toast: {
        success: (title, description) => toast.success(title, description),
        error: (title, description) => toast.error(title, description),
        info: (title, description) => toast.toast(title, description),
      },
      translate: (id, values) => formatMessage({ id }, values),
    }),
    [apiClient, tenantId, toast, formatMessage],
  );
}

function PluginLoadingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center space-y-4">
      <Spinner className="h-8 w-8 text-primary" />
      <p className="text-sm text-muted-foreground">Loading plugin...</p>
    </div>
  );
}
