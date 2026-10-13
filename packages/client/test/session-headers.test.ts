import { parseSessionLinkHeader, SESSION_LINK_HEADER } from '@shipbook/core';
import sessionManager from '../src/session-manager';

describe('SessionManager.getSessionHeaders', () => {
  afterEach(() => {
    sessionManager.appId = undefined;
    sessionManager.sessionId = undefined;
  });

  it('returns a versioned header that the backend parser accepts', () => {
    sessionManager.appId = '698ad6e6595b3f6a7590b24f';
    sessionManager.sessionId = '66f1c2a9e4b0d3f8a1b2c3d4';

    const headers = sessionManager.getSessionHeaders();

    expect(headers).toEqual({ [SESSION_LINK_HEADER]: '1:698ad6e6595b3f6a7590b24f:66f1c2a9e4b0d3f8a1b2c3d4' });
    expect(parseSessionLinkHeader(headers[SESSION_LINK_HEADER])).toEqual({
      appId: '698ad6e6595b3f6a7590b24f',
      sessionId: '66f1c2a9e4b0d3f8a1b2c3d4'
    });
  });

  it('returns no header before login completes', () => {
    sessionManager.appId = 'app-1';
    expect(sessionManager.getSessionHeaders()).toEqual({});
  });

  it('returns no header for a silenced device', () => {
    sessionManager.appId = 'app-1';
    sessionManager.sessionId = '';
    expect(sessionManager.getSessionHeaders()).toEqual({});
  });
});
