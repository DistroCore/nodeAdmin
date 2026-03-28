import { useIntl } from 'react-intl';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { LoginPage } from '@/components/business/loginPage';
import { ManagementOverviewPanel } from '@/components/business/managementOverviewPanel';
import { MenuManagementPanel } from '@/components/business/menuManagementPanel';
import { MessagePanel } from '@/components/business/messagePanel';
import { NotFoundPage } from '@/components/business/notFoundPage';
import { RegisterPage } from '@/components/business/registerPage';
import { ReleaseControlPanel } from '@/components/business/releaseControlPanel';
import { RoleManagementPanel } from '@/components/business/roleManagementPanel';
import { TenantControlPanel } from '@/components/business/tenantControlPanel';
import { UserManagementPanel } from '@/components/business/userManagementPanel';
import { AppLayout } from './layout/appLayout';
import { AuthGuard } from './authGuard';
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
    <Routes>
      {/* Public routes */}
      <Route element={<LoginPage />} path="/login" />
      <Route element={<RegisterPage />} path="/register" />

      {/* Protected routes */}
      <Route
        element={
          <AuthGuard>
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
                      <RequirePermission permission="users:view">
                        <UserManagementPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/users"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="roles:view">
                        <RoleManagementPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/roles"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="menus:view">
                        <MenuManagementPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/menus"
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
                <Route element={<NotFoundPage />} path="*" />
              </Routes>
            </AppLayout>
          </AuthGuard>
        }
        path="/*"
      />
    </Routes>
  );
}
