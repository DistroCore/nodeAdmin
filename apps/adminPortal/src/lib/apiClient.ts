interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  onTokenRefreshed?: (accessToken: string, refreshToken: string) => void;
  onLogout?: () => void;
}

export class ApiClient {
  private isRefreshing = false;
  private refreshSubscribers: ((token: string) => void)[] = [];

  constructor(private readonly config: ApiClientConfig) {}

  private buildHeaders(includeContentType = false): HeadersInit {
    const headers: HeadersInit = {};
    if (includeContentType) {
      headers['Content-Type'] = 'application/json';
    }
    const accessToken = this.config.getAccessToken?.();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }
    return headers;
  }

  private subscribeTokenRefresh(cb: (token: string) => void): void {
    this.refreshSubscribers.push(cb);
  }

  private onRefreshed(token: string): void {
    this.refreshSubscribers.map((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private async request<TResponse>(method: string, path: string, body?: unknown): Promise<TResponse> {
    const headers = this.buildHeaders(body !== undefined);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...(body !== undefined && { body: JSON.stringify(body) }),
      headers,
      method,
    });

    if (response.status === 401 && this.config.getRefreshToken && !path.includes('/auth/login') && !path.includes('/auth/refresh')) {
      if (!this.isRefreshing) {
        this.isRefreshing = true;
        try {
          const refreshToken = this.config.getRefreshToken();
          if (!refreshToken) throw new Error('No refresh token');

          const refreshResponse = await fetch(`${this.config.baseUrl}/api/v1/auth/refresh`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!refreshResponse.ok) {
            throw new Error('Refresh failed');
          }

          const tokens = await refreshResponse.json();
          this.config.onTokenRefreshed?.(tokens.accessToken, tokens.refreshToken);
          this.isRefreshing = false;
          this.onRefreshed(tokens.accessToken);
        } catch (error) {
          this.isRefreshing = false;
          this.config.onLogout?.();
          throw error;
        }
      }

      return new Promise<TResponse>((resolve, reject) => {
        this.subscribeTokenRefresh(async (token: string) => {
          try {
            const newHeaders = this.buildHeaders(body !== undefined);
            // Replace old auth header with new one
            (newHeaders as Record<string, string>).Authorization = `Bearer ${token}`;
            
            const retryResponse = await fetch(`${this.config.baseUrl}${path}`, {
              ...(body !== undefined && { body: JSON.stringify(body) }),
              headers: newHeaders,
              method,
            });
            
            if (!retryResponse.ok) {
              const text = await retryResponse.text().catch(() => '');
              reject(new Error(`HTTP ${retryResponse.status} for ${path}${text ? `: ${text}` : ''}`));
              return;
            }
            
            if (retryResponse.status === 204) {
              resolve(undefined as TResponse);
            } else {
              resolve((await retryResponse.json()) as TResponse);
            }
          } catch (err) {
            reject(err);
          }
        });
      });
    }

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} for ${path}${text ? `: ${text}` : ''}`);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await response.json()) as TResponse;
  }

  async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>('GET', path);
  }

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>('POST', path, body);
  }

  async put<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>('PUT', path, body);
  }

  async patch<TResponse>(path: string, body: unknown): Promise<TResponse> {
    return this.request<TResponse>('PATCH', path, body);
  }

  async del<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>('DELETE', path);
  }
}
