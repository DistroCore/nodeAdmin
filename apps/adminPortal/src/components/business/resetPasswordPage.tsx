import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Select } from '@/components/ui/select';
import { type AppLocale } from '@/i18n';
import { ApiClient } from '@/lib/apiClient';
import { useUiStore } from '@/stores/useUiStore';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
}

function resolveApiBaseUrl(): string {
  return (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() || '';
}

export function ResetPasswordPage(): JSX.Element {
  const { formatMessage: t, locale } = useIntl();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLocale = useUiStore((s) => s.setLocale);

  useEffect(() => {
    new ApiClient({ baseUrl: resolveApiBaseUrl() })
      .get<TenantItem[]>('/api/v1/tenants')
      .then(setTenants)
      .catch(() => {
        /* ignore */
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!tenantId.trim()) {
      setError('Tenant ID is required.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError(t({ id: 'auth.passwordMismatch' }));
      return;
    }

    setLoading(true);
    try {
      const client = new ApiClient({ baseUrl: resolveApiBaseUrl() });
      await client.post('/api/v1/auth/reset-password', { email, newPassword, tenantId });
      setSuccess(t({ id: 'auth.resetPasswordSuccess' }));
    } catch {
      setError(t({ id: 'auth.resetPasswordFailed' }));
    } finally {
      setLoading(false);
    }
  };

  const toggleLocale = () => setLocale((locale === 'zh' ? 'en' : 'zh') as AppLocale);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="fixed right-4 top-4 flex items-center gap-2">
        <button
          className="flex h-8 items-center rounded-md border border-border bg-card px-2 text-xs font-medium transition-colors hover:bg-accent"
          onClick={toggleLocale}
          type="button"
        >
          {locale === 'zh' ? 'EN' : '中'}
        </button>
        <button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card transition-colors hover:bg-accent"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          title={t({ id: 'theme.toggle' })}
          type="button"
        >
          {theme === 'dark' ? (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 7a5 5 0 100 10 5 5 0 000-10zm0-5a1 1 0 011 1v1a1 1 0 01-2 0V3a1 1 0 011-1zm0 18a1 1 0 011 1v1a1 1 0 01-2 0v-1a1 1 0 011-1zM5.64 5.64a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zm12.02 12.02a1 1 0 011.41 0l.71.71a1 1 0 01-1.41 1.41l-.71-.71a1 1 0 010-1.41zM2 12a1 1 0 011-1h1a1 1 0 010 2H3a1 1 0 01-1-1zm18 0a1 1 0 011-1h1a1 1 0 010 2h-1a1 1 0 01-1-1zM5.64 18.36a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0zm12.02-12.02a1 1 0 010-1.41l.71-.71a1 1 0 011.41 1.41l-.71.71a1 1 0 01-1.41 0z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z" />
            </svg>
          )}
        </button>
      </div>

      <Card className="w-full max-w-md p-6">
        <CardHeader className="mb-6 space-y-1 p-0 text-center">
          <CardTitle className="text-2xl">{t({ id: 'auth.resetPassword' })}</CardTitle>
          <CardDescription>{t({ id: 'brand' })}</CardDescription>
        </CardHeader>
        {success ? (
          <div className="space-y-4">
            <div className="rounded-md border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-600 dark:text-green-400">
              {success}
            </div>
            <Link className="block text-center text-sm text-primary underline hover:no-underline" to="/login">
              {t({ id: 'auth.goLogin' })}
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            ) : null}
            <FormField label={t({ id: 'auth.email' })} htmlFor="reset-email">
              <Input
                autoComplete="email"
                id="reset-email"
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                value={email}
              />
            </FormField>
            <FormField label={t({ id: 'profile.newPassword' })} htmlFor="reset-password">
              <div className="relative">
                <Input
                  autoComplete="new-password"
                  className="pr-10"
                  id="reset-password"
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                />
                <button
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                  type="button"
                >
                  {showPassword ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L6.59 6.59m7.532 7.532l3.29 3.29M3 3l18 18"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" strokeLinecap="round" strokeLinejoin="round" />
                      <path
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            </FormField>
            <FormField label={t({ id: 'auth.confirmPassword' })} htmlFor="reset-confirm">
              <Input
                autoComplete="new-password"
                id="reset-confirm"
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
            </FormField>
            <FormField label={t({ id: 'auth.tenantId' })} htmlFor="reset-tenant">
              {tenants.length > 0 ? (
                <Select
                  id="reset-tenant"
                  onChange={setTenantId}
                  options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))}
                  value={tenantId}
                />
              ) : (
                <Input
                  autoComplete="organization"
                  id="reset-tenant"
                  onChange={(e) => setTenantId(e.target.value)}
                  placeholder="default"
                  value={tenantId}
                />
              )}
            </FormField>
            <button
              className="flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              disabled={loading}
              type="submit"
            >
              {loading ? (
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
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {t({ id: 'common.loading' })}
                </>
              ) : (
                t({ id: 'auth.resetPassword' })
              )}
            </button>
          </form>
        )}
        {!success ? (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <Link className="text-primary underline hover:no-underline" to="/login">
              {t({ id: 'auth.goLogin' })}
            </Link>
          </p>
        ) : null}
      </Card>
    </div>
  );
}
