import { parseSessionLinkHeader } from '../src/models/session';

describe('parseSessionLinkHeader', () => {
  it('parses a version 1 value into appId and sessionId', () => {
    expect(parseSessionLinkHeader('1:app-1:sess-abc')).toEqual({ appId: 'app-1', sessionId: 'sess-abc' });
  });

  it('rejects unknown versions so future formats are ignored', () => {
    expect(parseSessionLinkHeader('2:app-1:sess-abc')).toBeUndefined();
    expect(parseSessionLinkHeader('app-1:sess-abc')).toBeUndefined();
  });

  it('rejects extra segments', () => {
    expect(parseSessionLinkHeader('1:app:sess:extra')).toBeUndefined();
  });

  it('returns undefined for undefined, empty, or malformed values', () => {
    expect(parseSessionLinkHeader(undefined)).toBeUndefined();
    expect(parseSessionLinkHeader('')).toBeUndefined();
    expect(parseSessionLinkHeader('no-separator')).toBeUndefined();
    expect(parseSessionLinkHeader('1::sess')).toBeUndefined();
    expect(parseSessionLinkHeader('1:app:')).toBeUndefined();
    expect(parseSessionLinkHeader('1:app')).toBeUndefined();
  });
});
