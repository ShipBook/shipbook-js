import connectionClient, { HttpMethod } from '../src/networking/connection-client';
import { APP_ID_HEADER, SDK_HEADER } from '../src/models/session';

describe('connectionClient without a control plane (the server SDKs)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('sends no control headers and is never paused by a response', async () => {
    connectionClient.setDeps({ getToken: () => 'token', refreshToken: async () => false });
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('', { status: 429, headers: { 'Retry-After': '120' } }));

    const first = await connectionClient.request('sessions/ingest', { sessions: [] }, HttpMethod.POST);
    const second = await connectionClient.request('sessions/ingest', { sessions: [] }, HttpMethod.POST);

    expect(first.status).toBe(429);
    expect(second.status).toBe(429);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const headers = fetchSpy.mock.calls[1][1]!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.has(APP_ID_HEADER)).toBe(false);
    expect(headers.has(SDK_HEADER)).toBe(false);
  });
});
