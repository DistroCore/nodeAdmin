import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { setAuthFromLogin } from '@/stores/useAuthStore';

/**
 * OAuth callback page — the backend redirects here after successful OAuth.
 * URL contains tokens as query params: ?accessToken=...&refreshToken=...&tenantId=...&userId=...&name=...&roles=...
 * This page extracts them, stores auth state, and navigates to overview.
 */
export function OAuthCallbackPage(): JSX.Element {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const accessToken = searchParams.get('accessToken');
    const refreshToken = searchParams.get('refreshToken');
    const tenantId = searchParams.get('tenantId');
    const userId = searchParams.get('userId');
    const name = searchParams.get('name');
    const rolesParam = searchParams.get('roles');

    if (!accessToken || !refreshToken || !tenantId || !userId) {
      navigate('/login?error=oauth_callback_failed', { replace: true });
      return;
    }

    const roles = rolesParam ? rolesParam.split(',').filter(Boolean) : [];

    setAuthFromLogin({
      accessToken,
      identity: { roles, tenantId, userId },
      name: name || null,
      refreshToken,
    });

    navigate('/overview', { replace: true });
  }, [searchParams, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-2">
        <svg className="mx-auto h-8 w-8 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <p className="text-sm text-muted-foreground">Completing login...</p>
      </div>
    </div>
  );
}
