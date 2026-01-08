export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  DELETE = 'DELETE',
  PUT = 'PUT'
}

/**
 * Connection client for API requests
 * Manages authentication and token refresh
 */
class ConnectionClient {
  public BASE_URL = 'https://api.shipbook.io/v1/';
  
  private getToken: () => string | undefined = () => undefined;
  private refreshTokenFn: () => Promise<boolean> = async () => false;

  /**
   * Configure the connection client with auth functions
   */
  configure(options: {
    getToken: () => string | undefined;
    refreshToken: () => Promise<boolean>;
  }): void {
    this.getToken = options.getToken;
    this.refreshTokenFn = options.refreshToken;
  }

  async request(url: string, body?: object, method?: HttpMethod): Promise<Response> {
    const headers: Headers = new Headers({
      'Content-Type': 'application/json'
    });
    
    const token = this.getToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    
    const init: RequestInit = { headers };

    if (body) {
      init.body = JSON.stringify(body);
    }

    if (method) {
      init.method = method;
    }

    let resp = await fetch(this.BASE_URL + url, init);
    
    // Handle token expiration
    if (!resp.ok && resp.status === 401 && resp.statusText === 'TokenExpired') {
      if (!await this.refreshTokenFn()) {
        return resp;
      }
      resp = await this.request(url, body, method);
    }

    return resp;
  }
}

export default new ConnectionClient();
