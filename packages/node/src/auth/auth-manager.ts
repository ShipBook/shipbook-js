export interface AuthTokens {
  token: string;
  expiresIn: number;  // seconds
  refreshToken: string;
}

export interface AuthManagerDeps {
  sendRequest: (url: string, body: object, method: string) => Promise<Response>;
}

export class AuthManager {
  private token?: string;
  private refreshToken?: string;
  private expiresAt?: Date;
  private refreshTimer?: ReturnType<typeof setTimeout>;

  constructor(private deps: AuthManagerDeps) {}

  async login(appId: string, appKey: string): Promise<boolean> {
    console.log('[Shipbook] Attempting login to auth/loginSdkServer');
    try {
      const response = await this.deps.sendRequest(
        'auth/loginSdkServer',
        { appId, appKey },
        'POST'
      );

      if (!response.ok) {
        console.warn('[Shipbook] Auth failed:', await response.text());
        return false;
      }

      const data: AuthTokens = await response.json();
      console.log('[Shipbook] Auth succeeded, token expires in', data.expiresIn, 'seconds');
      this.setTokens(data);
      return true;
    } catch (error) {
      console.warn('[Shipbook] Auth error:', error);
      return false;
    }
  }

  private setTokens(data: AuthTokens): void {
    this.token = data.token;
    this.refreshToken = data.refreshToken;
    this.expiresAt = new Date(Date.now() + data.expiresIn * 1000);

    // Schedule refresh before expiry (80% of lifetime)
    const refreshIn = data.expiresIn * 0.8 * 1000;
    this.scheduleRefresh(refreshIn);
  }

  private scheduleRefresh(ms: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.refresh();
    }, ms);
  }

  private async refresh(): Promise<void> {
    if (!this.refreshToken) {
      console.error('[Shipbook] No refresh token available');
      return;
    }

    try {
      const response = await this.deps.sendRequest(
        'auth/refresh',
        { refreshToken: this.refreshToken },
        'POST'
      );

      if (!response.ok) {
        console.error('[Shipbook] Token refresh failed:', await response.text());
        return;
      }

      const data: AuthTokens = await response.json();
      this.setTokens(data);
    } catch (error) {
      console.error('[Shipbook] Token refresh error:', error);
    }
  }

  getToken(): string | undefined {
    // Check if token is expired
    if (this.expiresAt && new Date() >= this.expiresAt) {
      return undefined;
    }
    return this.token;
  }

  destroy(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
  }
}
