import { useEffect } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import type { PluginComponentProps } from '@nodeadmin/shared-types';

// Capture the host the shell injects into the plugin component. Assigned in an effect (not during
// render) to stay side-effect-free per the react-hooks rules.
let capturedHost: PluginComponentProps['host'] | null = null;

function ProbePlugin({ host }: PluginComponentProps) {
  useEffect(() => {
    capturedHost = host;
  }, [host]);
  return <div data-testid="probe">{host.tenantId ?? 'no-tenant'}</div>;
}

vi.mock('@/hooks/usePluginLoader', () => ({
  usePluginLoader: () => ({ Component: ProbePlugin, isLoading: false, error: null }),
}));

vi.mock('react-intl', () => ({
  useIntl: () => ({ formatMessage: ({ id }: { id: string }) => `t:${id}`, locale: 'en' }),
}));

const apiClient = { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), del: vi.fn() };
vi.mock('@/hooks/useApiClient', () => ({ useApiClient: () => apiClient }));

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: (selector: (s: { tenantId: string | null }) => unknown) => selector({ tenantId: 'tenant-42' }),
}));

const successSpy = vi.fn();
const errorSpy = vi.fn();
const infoSpy = vi.fn();
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({ success: successSpy, error: errorSpy, toast: infoSpy }),
}));

const hasPermissionSpy = vi.fn().mockReturnValue(true);
vi.mock('@/stores/usePermissionStore', () => ({
  usePermissionStore: { getState: () => ({ hasPermission: hasPermissionSpy }) },
}));

import { PluginView } from './pluginView';

describe('PluginView host injection', () => {
  it('passes a host object exposing apiClient, tenantId, permissions, toast and i18n', () => {
    render(<PluginView pluginName="example" uiUrl="http://localhost/plugin.js" />);

    expect(screen.getByTestId('probe')).toHaveTextContent('tenant-42');
    expect(capturedHost).not.toBeNull();
    expect(capturedHost!.apiClient).toBe(apiClient);
    expect(capturedHost!.tenantId).toBe('tenant-42');

    capturedHost!.toast.info('hi');
    expect(infoSpy).toHaveBeenCalledWith('hi', undefined);

    expect(capturedHost!.hasPermission('example:read')).toBe(true);
    expect(hasPermissionSpy).toHaveBeenCalledWith('example:read');

    expect(capturedHost!.translate('plugin.title')).toBe('t:plugin.title');
  });
});
