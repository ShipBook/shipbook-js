import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../src/adapters/storage';

jest.mock('@react-native-async-storage/async-storage', () => {
  const items = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => items.get(key) ?? null,
      setItem: async (key: string, value: string) => { items.set(key, value); },
      removeItem: async (key: string) => { items.delete(key); },
      clear: async () => { items.clear(); }
    }
  };
});

describe('ReactNativeStorage.getObj', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('returns the parsed object for valid JSON', async () => {
    await storage.setObj('config', { appenders: [], loggers: [] });

    expect(await storage.getObj('config')).toEqual({ appenders: [], loggers: [] });
  });

  test('returns undefined and removes the key when the stored value is not JSON', async () => {
    await AsyncStorage.setItem('config', '�� not json');

    expect(await storage.getObj('config')).toBeUndefined();
    expect(await AsyncStorage.getItem('config')).toBeNull();
  });

  test('returns undefined for a missing key', async () => {
    expect(await storage.getObj('missing')).toBeUndefined();
  });
});
