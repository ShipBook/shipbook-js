import connectionClient, { HttpMethod } from '../src/networking/connection-client';
import { APP_ID_HEADER, SDK_HEADER, PAUSE_HEADER } from '../src/models/session';

describe('connectionClient without a control plane (the server SDKs)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test.each([
    ['a 429 with Retry-After', 429, { 'Retry-After': '120' }],
    ['a 503 with Retry-After', 503, { 'Retry-After': '120' }],
    ['a 429 without Retry-After', 429, {}],
    ['a 401 with x-shipbook-pause', 401, { [PAUSE_HEADER]: '120', 'Retry-After': '120' }]
  ])('%s neither pauses nor backs off, and no control header is sent', async (_name, status, responseHeaders) => {
    connectionClient.setDeps({ getToken: () => 'token', refreshToken: async () => false });
    const fetchSpy = jest.spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response('', { status, headers: responseHeaders }));

    const first = await connectionClient.request('sessions/ingest', { sessions: [] }, HttpMethod.POST);
    const second = await connectionClient.request('sessions/ingest', { sessions: [] }, HttpMethod.POST);

    expect(first.status).toBe(status);
    expect(second.status).toBe(status);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const headers = fetchSpy.mock.calls[1][1]!.headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.has(APP_ID_HEADER)).toBe(false);
    expect(headers.has(SDK_HEADER)).toBe(false);
  });
});
