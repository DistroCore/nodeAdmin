import { useState } from 'react';
import { useIntl } from 'react-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { useApiClient } from '@/hooks/useApiClient';
import { useAuthStore } from '@/stores/useAuthStore';

interface OAuthAccount {
  provider: string;
  providerId: string;
  createdAt: string;
}

const OAUTH_PROVIDERS = ['github', 'google'] as const;

function LinkedAccountsSection(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const toast = useToast();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const { data: accounts = [] } = useQuery({
    queryKey: ['oauth-accounts'],
    queryFn: () =>
      apiClient.get<{ accounts: OAuthAccount[] }>('/api/v1/auth/oauth-accounts'),
    select: (data) => data.accounts ?? [],
  });

  const unlinkMutation = useMutation({
    mutationFn: (provider: string) =>
      apiClient.del(`/api/v1/auth/oauth-accounts/${provider}`),
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ['oauth-accounts'] });
      toast.success(
        t({ id: 'profile.unlinkSuccess' }, { provider: t({ id: `profile.provider.${provider}` }) })
      );
    },
    onError: (_, provider) => {
      toast.error(
        t({ id: 'profile.unlinkFailed' }, { provider: t({ id: `profile.provider.${provider}` }) })
      );
    },
  });

  const linkedProviders = new Set(accounts.map((a: OAuthAccount) => a.provider));

  return (
    <div className="space-y-2">
      {OAUTH_PROVIDERS.map((provider) => {
        const isLinked = linkedProviders.has(provider);
        return (
          <div key={provider} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {t({ id: `profile.provider.${provider}` })}
              </span>
              <Badge variant={isLinked ? 'default' : 'secondary'}>
                {isLinked ? t({ id: 'profile.linked' }) : t({ id: 'profile.notLinked' })}
              </Badge>
            </div>
            {isLinked ? (
              <Button
                onClick={() => {
                  if (window.confirm(t({ id: 'profile.unlinkConfirm' }, { provider: t({ id: `profile.provider.${provider}` }) }))) {
                    unlinkMutation.mutate(provider);
                  }
                }}
                size="sm"
                type="button"
                variant="outline"
              >
                {t({ id: 'profile.unlink' })}
              </Button>
            ) : (
              <Button size="sm" type="button" variant="outline" disabled>
                {t({ id: 'profile.link' })}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ProfilePanel(): JSX.Element {
  const { formatMessage: t } = useIntl();
  const toast = useToast();
  const apiClient = useApiClient();
  const userId = useAuthStore((s) => s.userId);
  const userName = useAuthStore((s) => s.userName);
  const tenantId = useAuthStore((s) => s.tenantId);
  const userRoles = useAuthStore((s) => s.userRoles);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const changePasswordMutation = useMutation({
    mutationFn: (payload: { currentPassword: string; newPassword: string }) =>
      apiClient.post<{ success: boolean }>('/api/v1/auth/change-password', payload),
    onSuccess: () => {
      toast.success(t({ id: 'profile.passwordChangeSuccess' }));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    },
    onError: () => {
      toast.error(t({ id: 'profile.passwordChangeFailed' }));
    },
  });

  const handleChangePassword = () => {
    if (newPassword !== confirmPassword) {
      toast.error(t({ id: 'auth.passwordMismatch' }));
      return;
    }
    if (!currentPassword || !newPassword) return;
    changePasswordMutation.mutate({
      currentPassword,
      newPassword,
    });
  };

  return (
    <section className="h-full overflow-y-auto">
      <h3 className="mb-1 text-xl font-semibold text-foreground">{t({ id: 'profile.title' })}</h3>
      <p className="mb-6 text-sm text-muted-foreground">{t({ id: 'profile.desc' })}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        {/* User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t({ id: 'profile.info' })}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'profile.avatar' })}</dt>
                <dd>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {userName ? userName.slice(0, 2).toUpperCase() : '?'}
                  </div>
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'profile.userName' })}</dt>
                <dd className="font-medium text-foreground">{userName ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'profile.userId' })}</dt>
                <dd className="font-mono text-xs text-foreground">{userId ?? '—'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'profile.roles' })}</dt>
                <dd className="text-foreground">
                  {userRoles.length > 0 ? userRoles.join(', ') : '—'}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t({ id: 'profile.tenantId' })}</dt>
                <dd className="font-mono text-xs text-foreground">{tenantId ?? '—'}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Change Password */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{t({ id: 'profile.changePassword' })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t({ id: 'profile.currentPassword' })}
              </label>
              <Input
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder={t({ id: 'profile.currentPassword' })}
                type="password"
                value={currentPassword}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t({ id: 'profile.newPassword' })}
              </label>
              <Input
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t({ id: 'profile.newPassword' })}
                type="password"
                value={newPassword}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t({ id: 'auth.confirmPassword' })}
              </label>
              <Input
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t({ id: 'auth.confirmPassword' })}
                type="password"
                value={confirmPassword}
              />
            </div>
            <Button
              disabled={changePasswordMutation.isPending || !currentPassword || !newPassword}
              onClick={handleChangePassword}
              size="sm"
              type="button"
            >
              {t({ id: 'profile.updatePassword' })}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Linked Accounts */}
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">{t({ id: 'profile.linkedAccounts' })}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-muted-foreground">
            {t({ id: 'profile.linkedAccounts.desc' })}
          </p>
          <LinkedAccountsSection />
        </CardContent>
      </Card>
    </section>
  );
}
