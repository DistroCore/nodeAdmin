import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link, useNavigate } from 'react-router-dom';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/formField';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { type AppLocale } from '@/i18n';
import { ApiClient } from '@/lib/apiClient';
import { setAuthFromLogin } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

interface TenantItem {
  id: string;
  name: string;
  slug: string;
}

export function LoginPage(): JSX.Element {
  const { formatMessage: t, locale } = useIntl();
  const navigate = useNavigate();
  const [loginType, setLoginType] = useState<'email' | 'sms'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [tenantId, setTenantId] = useState('default');
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);

  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);
  const setLocale = useUiStore((s) => s.setLocale);

  const isSingleTenant = import.meta.env.VITE_SINGLE_TENANT_MODE === 'true';

  useEffect(() => {
    if (isSingleTenant) return;

    const apiBaseUrl =
      (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() ??
      `http://${window.location.hostname}:11451`;
    new ApiClient({ baseUrl: apiBaseUrl })
      .get<TenantItem[]>('/api/v1/tenants')
      .then(setTenants)
      .catch(() => {
        /* ignore — tenant list is optional */
      });
  }, [isSingleTenant]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const apiBaseUrl =
        (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() ??
        `http://${window.location.hostname}:11451`;
      const client = new ApiClient({ baseUrl: apiBaseUrl });
      const data = await client.post<{
        accessToken: string;
        identity: { tenantId: string; userId: string };
        refreshToken: string;
        tokenType: string;
      }>('/api/v1/auth/login', { email, password, tenantId });
      setAuthFromLogin(data);
      navigate('/overview', { replace: true });
    } catch {
      setError(t({ id: 'auth.loginFailed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSmsLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const apiBaseUrl =
        (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() ??
        `http://${window.location.hostname}:11451`;
      const client = new ApiClient({ baseUrl: apiBaseUrl });
      const data = await client.post<{
        accessToken: string;
        identity: { tenantId: string; userId: string };
        refreshToken: string;
        tokenType: string;
      }>('/api/v1/auth/sms/login', { phone, code, tenantId });
      setAuthFromLogin(data);
      navigate('/overview', { replace: true });
    } catch {
      setError(t({ id: 'auth.loginFailed' }));
    } finally {
      setLoading(false);
    }
  };

  const handleSendSms = async () => {
    if (!phone) return;
    setSmsSending(true);
    setError('');
    try {
      const apiBaseUrl =
        (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() ??
        `http://${window.location.hostname}:11451`;
      const client = new ApiClient({ baseUrl: apiBaseUrl });
      await client.post('/api/v1/auth/sms/send', { phone });
      setSmsSent(true);
      setTimeout(() => setSmsSent(false), 3000);
    } catch {
      setError(t({ id: 'auth.smsSendFailed' }));
    } finally {
      setSmsSending(false);
    }
  };

  const handleOAuthLogin = (provider: 'github' | 'google') => {
    const apiBaseUrl =
      (import.meta.env.VITE_CORE_API_BASE_URL as string | undefined)?.trim() ??
      `http://${window.location.hostname}:11451`;
    window.open(`${apiBaseUrl}/api/v1/auth/login/oauth/${provider}`, '_self');
  };

  const toggleLocale = () => setLocale((locale === 'zh' ? 'en' : 'zh') as AppLocale);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* Theme / i18n controls */}
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
          <CardTitle className="text-2xl">{t({ id: 'auth.login' })}</CardTitle>
          <CardDescription>{t({ id: 'brand' })}</CardDescription>
        </CardHeader>

        <div className="mb-6 flex rounded-md bg-muted p-1">
          <button
            className={`flex-1 rounded-sm py-1.5 text-sm font-medium transition-all ${
              loginType === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setLoginType('email')}
          >
            {t({ id: 'auth.email' })}
          </button>
          <button
            className={`flex-1 rounded-sm py-1.5 text-sm font-medium transition-all ${
              loginType === 'sms' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
            }`}
            onClick={() => setLoginType('sms')}
          >
            {t({ id: 'auth.sms' })}
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {loginType === 'email' ? (
          <form className="space-y-4" onSubmit={handleEmailLogin}>
            <FormField label={t({ id: 'auth.email' })} htmlFor="login-email">
              <Input
                autoComplete="email"
                id="login-email"
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                value={email}
              />
            </FormField>
            <FormField label={t({ id: 'auth.password' })} htmlFor="login-password">
              <div className="relative">
                <Input
                  autoComplete="current-password"
                  className="pr-10"
                  id="login-password"
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
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
            {!isSingleTenant && (
              <FormField label={t({ id: 'auth.tenantId' })} htmlFor="login-tenant">
                {tenants.length > 0 ? (
                  <Select
                    id="login-tenant"
                    onChange={setTenantId}
                    options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))}
                    value={tenantId}
                  />
                ) : (
                  <Input
                    autoComplete="organization"
                    id="login-tenant"
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="default"
                    value={tenantId}
                  />
                )}
              </FormField>
            )}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t({ id: 'common.loading' }) : t({ id: 'auth.login' })}
            </Button>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleSmsLogin}>
            <FormField label={t({ id: 'auth.sms.phone' })} htmlFor="login-phone">
              <Input
                autoComplete="tel"
                id="login-phone"
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1234567890"
                required
                type="tel"
                value={phone}
              />
            </FormField>
            <FormField label={t({ id: 'auth.sms.code' })} htmlFor="login-code">
              <div className="flex gap-2">
                <Input
                  autoComplete="one-time-code"
                  className="flex-1"
                  id="login-code"
                  onChange={(e) => setCode(e.target.value)}
                  required
                  type="text"
                  value={code}
                />
                <Button
                  className="shrink-0"
                  disabled={smsSending || !phone}
                  onClick={handleSendSms}
                  type="button"
                  variant="outline"
                >
                  {smsSent ? t({ id: 'auth.sms.sendCodeSuccess' }) : t({ id: 'auth.sms.sendCode' })}
                </Button>
              </div>
            </FormField>
            {!isSingleTenant && (
              <FormField label={t({ id: 'auth.tenantId' })} htmlFor="login-tenant-sms">
                {tenants.length > 0 ? (
                  <Select
                    id="login-tenant-sms"
                    onChange={setTenantId}
                    options={tenants.map((t) => ({ value: t.id, label: `${t.name} (${t.slug})` }))}
                    value={tenantId}
                  />
                ) : (
                  <Input
                    autoComplete="organization"
                    id="login-tenant-sms"
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="default"
                    value={tenantId}
                  />
                )}
              </FormField>
            )}
            <Button className="w-full" disabled={loading} type="submit">
              {loading ? t({ id: 'common.loading' }) : t({ id: 'auth.login' })}
            </Button>
          </form>
        )}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">{t({ id: 'auth.orDivider' })}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Button variant="outline" onClick={() => handleOAuthLogin('github')}>
            <svg className="mr-2 h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
            </svg>
            {t({ id: 'auth.oauth.github' })}
          </Button>
          <Button variant="outline" onClick={() => handleOAuthLogin('google')}>
            <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
              <path d="M1 1h22v22H1z" fill="none" />
            </svg>
            {t({ id: 'auth.oauth.google' })}
          </Button>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          <Link className="text-primary underline hover:no-underline" to="/reset-password">
            {t({ id: 'auth.forgotPassword' })}
          </Link>
        </p>

        <p className="text-center text-sm text-muted-foreground">
          {t({ id: 'auth.noAccount' })}{' '}
          <Link className="text-primary underline hover:no-underline" to="/register">
            {t({ id: 'auth.goRegister' })}
          </Link>
        </p>
      </Card>
    </div>
  );
}
