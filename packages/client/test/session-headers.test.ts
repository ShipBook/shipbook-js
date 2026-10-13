import { SESSION_LINK_HEADER } from '@shipbook/core';
import sessionManager from '../src/session-manager';

describe('SessionManager.getSessionHeaders', () => {
  afterEach(() => {
    sessionManager.sessionLink = undefined;
  });

  it('forwards the server-minted session link unchanged', () => {
    sessionManager.sessionLink = '1:698ad6e6595b3f6a7590b24f:66f1c2a9e4b0d3f8a1b2c3d4';
    expect(sessionManager.getSessionHeaders()).toEqual({
      [SESSION_LINK_HEADER]: '1:698ad6e6595b3f6a7590b24f:66f1c2a9e4b0d3f8a1b2c3d4'
    });
  });

  it('returns no header before login completes', () => {
    expect(sessionManager.getSessionHeaders()).toEqual({});
  });

  it('returns no header for a silenced device', () => {
    sessionManager.sessionLink = '';
    expect(sessionManager.getSessionHeaders()).toEqual({});
  });
});
