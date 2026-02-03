import { InnerLog } from '@shipbook/core';

export interface AuthManagerDeps {
  sendRequest: (url: string, body: object, method: string) => Promise<Response>;
}

export class AuthManager {
  private token?: string;
  private expiresAt?: Date;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private appId?: string;
  private appKey?: string;

  constructor(private deps: AuthManagerDeps) {}

  async login(appId: string, appKey: string): Promise<boolean> {
    // Store credentials for re-login
    this.appId = appId;
    this.appKey = appKey;

    return this.doLogin();
  }

  private async doLogin(): Promise<boolean> {
    InnerLog.i('Attempting login to auth/loginSdkServer');
    try {
      const response = await this.deps.sendRequest(
        'auth/loginSdkServer',
        { appId: this.appId, appKey: this.appKey },
        'POST'
      );

      if (!response.ok) {
        InnerLog.e('Auth failed:', await response.text());
        return false;
      }

      const data: { token: string } = await response.json();
      this.setToken(data.token);
      return true;
    } catch (error) {
      InnerLog.e('Auth error:', error);
      return false;
    }
  }

  private setToken(token: string): void {
    this.token = token;

    // Decode JWT to extract expiration
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    this.expiresAt = new Date(payload.exp * 1000);

    const expiresIn = Math.floor((this.expiresAt.getTime() - Date.now()) / 1000);
    InnerLog.i('Auth succeeded, token expires in', expiresIn, 'seconds');

    // Schedule re-login at 80% of token lifetime
    this.scheduleRefresh(expiresIn * 0.8 * 1000);
  }

  private scheduleRefresh(ms: number): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = setTimeout(() => {
      this.doLogin();
    }, ms);
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
