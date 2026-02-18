import { InnerLog, connectionClient, HttpMethod } from '@shipbook/core';
import type { ConfigResponse } from '@shipbook/core';

export interface LoginResult {
  token: string;
  config: ConfigResponse;
}

class AuthManager {
  private token?: string;
  private expiresAt?: Date;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private appId?: string;
  private appKey?: string;

  async login(appId: string, appKey: string): Promise<LoginResult | undefined> {
    this.appId = appId;
    this.appKey = appKey;
    return this.doLogin();
  }

  private async doLogin(): Promise<LoginResult | undefined> {
    InnerLog.i('Attempting login to auth/loginSdkServer');
    try {
      const response = await connectionClient.request(
        'auth/loginSdkServer',
        { appId: this.appId, appKey: this.appKey },
        HttpMethod.POST
      );

      if (!response.ok) {
        InnerLog.e('Auth failed:', await response.text());
        return undefined;
      }

      const data: LoginResult = await response.json();
      this.setToken(data.token);
      return data;
    } catch (error) {
      InnerLog.e('Auth error:', error);
      return undefined;
    }
  }

  private setToken(token: string): void {
    this.token = token;

    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    this.expiresAt = new Date(payload.exp * 1000);

    const expiresIn = Math.floor((this.expiresAt.getTime() - Date.now()) / 1000);
    InnerLog.i('Auth succeeded, token expires in', expiresIn, 'seconds');

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

export const authManager = new AuthManager();
