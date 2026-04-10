interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
}

export class ApiClient {
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

  private async request<TResponse>(method: string, path: string, body?: unknown): Promise<TResponse> {
    const headers = this.buildHeaders(body !== undefined);
    const response = await fetch(`${this.config.baseUrl}${path}`, {
      ...(body !== undefined && { body: JSON.stringify(body) }),
      headers,
      method,
    });

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
