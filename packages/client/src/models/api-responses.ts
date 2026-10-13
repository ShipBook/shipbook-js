import type { ConfigResponse } from '@shipbook/core';

/**
 * Response from auth/loginSdk endpoint
 */
export interface LoginResponse {
  token: string;
  config: ConfigResponse;
  sessionUrl: string;
  sessionLink: string; // Opaque x-shipbook-session value; empty when the device is silenced
}

/**
 * Response from auth/refreshSdkToken endpoint
 */
export interface RefreshTokenResponse {
  token: string;
}
