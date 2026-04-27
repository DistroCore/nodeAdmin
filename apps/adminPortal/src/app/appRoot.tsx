import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { useEffect } from 'react';
import { LoginPage } from '@/components/business/loginPage';
import { OAuthCallbackPage } from '@/components/business/oauthCallbackPage';
import { ResetPasswordPage } from '@/components/business/resetPasswordPage';
import { ManagementOverviewPanel } from '@/components/business/managementOverviewPanel';
import { MenuManagementPanel } from '@/components/business/menuManagementPanel';
import { MessagePanel } from '@/components/business/messagePanel';
import { NotFoundPage } from '@/components/business/notFoundPage';
import { RegisterPage } from '@/components/business/registerPage';
import { ReleaseControlPanel } from '@/components/business/releaseControlPanel';
import { RoleManagementPanel } from '@/components/business/roleManagementPanel';
import { SettingsPanel } from '@/components/business/settingsPanel';
import { ProfilePanel } from '@/components/business/profilePanel';
import { TenantControlPanel } from '@/components/business/tenantControlPanel';
import { UserManagementPanel } from '@/components/business/userManagementPanel';
import { AuditLogPanel } from '@/components/business/auditLogPanel';
import { SystemMetricsPanel } from '@/components/business/systemMetricsPanel';
import { ModernizerPanel } from '@/components/business/modernizerPanel';
import { BacklogPanel } from '@/components/business/backlogPanel';
import { NotificationPanel } from '@/components/business/notificationPanel';
import { PluginMarketplacePage } from '@/components/business/plugins/PluginMarketplacePage';
import { PluginDetailPage } from '@/components/business/plugins/PluginDetailPage';
import { InstalledPluginsPage } from '@/components/business/plugins/InstalledPluginsPage';
import { PluginSettingsPage } from '@/components/business/plugins/PluginSettingsPage';
import { usePluginStore } from '@/stores/usePluginStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { usePermissionStore } from '@/stores/usePermissionStore';
import { PluginView } from './pluginView';
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
  const plugins = usePluginStore((s) => s.plugins);
  const userRoles = useAuthStore((s) => s.userRoles);
  const setPermissionsFromRoles = usePermissionStore((s) => s.setPermissionsFromRoles);

  useEffect(() => {
    setPermissionsFromRoles(userRoles);
  }, [userRoles, setPermissionsFromRoles]);

  return (
    <Routes>
      {/* Public routes */}
      <Route element={<LoginPage />} path="/login" />
      <Route element={<OAuthCallbackPage />} path="/auth/callback" />
      <Route element={<RegisterPage />} path="/register" />
      <Route element={<ResetPasswordPage />} path="/reset-password" />

      {/* Protected routes */}
      <Route
        element={
          <AuthGuard>
            <AppLayout>
              <Routes>
                <Route element={<Navigate replace to="/overview" />} path="/" />

                {/* Plugin marketplace and management */}
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="plugins:view">
                        <PluginMarketplacePage />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/plugins/marketplace"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="plugins:manage">
                        <PluginDetailPage />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/plugins/marketplace/:id"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="plugins:view">
                        <InstalledPluginsPage />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/plugins/installed"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="plugins:manage">
                        <PluginSettingsPage />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/plugins/settings/:id"
                />

                {/* Plugin routes */}
                {plugins
                  .filter((p) => p.enabled && p.uiUrl)
                  .map((plugin) => (
                    <Route
                      element={
                        <RouteModule>
                          <PluginView pluginName={plugin.name} uiUrl={plugin.uiUrl!} />
                        </RouteModule>
                      }
                      key={plugin.name}
                      path={`/plugins/${plugin.name}/*`}
                    />
                  ))}

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
                      <RequirePermission permission="audit:view">
                        <AuditLogPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/audit"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="audit:view">
                        <SystemMetricsPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/metrics"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="audit:view">
                        <NotificationPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/notifications"
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
                      <RequirePermission permission="tenants:view">
                        <TenantControlPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/tenants"
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
                        <SettingsPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/settings"
                />
                <Route
                  element={
                    <RouteModule>
                      <ProfilePanel />
                    </RouteModule>
                  }
                  path="/profile"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="modernizer:view">
                        <ModernizerPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/modernizer"
                />
                <Route
                  element={
                    <RouteModule>
                      <RequirePermission permission="backlog:view">
                        <BacklogPanel />
                      </RequirePermission>
                    </RouteModule>
                  }
                  path="/backlog"
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
