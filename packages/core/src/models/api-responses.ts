import type { ConfigResponse } from './config-response';

/**
 * Response from auth/loginSdk endpoint
 */
export interface LoginResponse {
  token: string;
  config: ConfigResponse;
  sessionUrl: string;
}

/**
 * Response from auth/refreshSdkToken endpoint
 */
export interface RefreshTokenResponse {
  token: string;
}
