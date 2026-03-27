import { useIntl } from 'react-intl';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { ManagementOverviewPanel } from '@/Components/Business/managementOverviewPanel';
import { MessagePanel } from '@/Components/Business/messagePanel';
import { ReleaseControlPanel } from '@/Components/Business/releaseControlPanel';
import { TenantControlPanel } from '@/Components/Business/tenantControlPanel';
import { AppLayout } from './Layout/appLayout';
import { ModuleErrorBoundary } from './moduleErrorBoundary';
import { RequirePermission } from './requirePermission';

function ImConversationRoute(): JSX.Element {
  const { convId } = useParams<{ convId: string }>();
  return <MessagePanel conversationIdOverride={convId} />;
}

function RouteModule({ children }: { children: JSX.Element }): JSX.Element {
  return <ModuleErrorBoundary>{children}</ModuleErrorBoundary>;
}

export function AppRoot(): JSX.Element {
  const { formatMessage: t } = useIntl();

  return (
    <AppLayout>
      <Routes>
        <Route element={<Navigate replace to="/overview" />} path="/" />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="overview:view">
                <ManagementOverviewPanel />
              </RequirePermission>
            </RouteModule>
          }
          path="/overview"
        />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="im:view">
                <MessagePanel />
              </RequirePermission>
            </RouteModule>
          }
          path="/im"
        />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="im:view">
                <ImConversationRoute />
              </RequirePermission>
            </RouteModule>
          }
          path="/im/:convId"
        />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="tenant:view">
                <TenantControlPanel />
              </RequirePermission>
            </RouteModule>
          }
          path="/tenant"
        />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="release:view">
                <ReleaseControlPanel />
              </RequirePermission>
            </RouteModule>
          }
          path="/release"
        />
        <Route
          element={
            <RouteModule>
              <RequirePermission permission="settings:view">
                <section className="h-full overflow-y-auto">
                  <div className="rounded-md border border-border bg-card p-4 text-sm text-muted-foreground">
                    {t({ id: 'settings.reserved' })}
                  </div>
                </section>
              </RequirePermission>
            </RouteModule>
          }
          path="/settings"
        />
        <Route element={<Navigate replace to="/overview" />} path="*" />
      </Routes>
    </AppLayout>
  );
}
