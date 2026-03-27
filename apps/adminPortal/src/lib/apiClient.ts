interface ApiClientConfig {
  baseUrl: string;
  getAccessToken?: () => string | null;
}

export class ApiClient {
  constructor(private readonly config: ApiClientConfig) {}

  async get<TResponse>(path: string): Promise<TResponse> {
    const headers: HeadersInit = {};

    const accessToken = this.config.getAccessToken?.();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      headers,
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${path}`);
    }

    return (await response.json()) as TResponse;
  }

  async post<TResponse>(path: string, body: unknown): Promise<TResponse> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    const accessToken = this.config.getAccessToken?.();
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${this.config.baseUrl}${path}`, {
      body: JSON.stringify(body),
      headers,
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${path}`);
    }

    return (await response.json()) as TResponse;
  }
}
