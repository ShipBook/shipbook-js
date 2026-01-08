import AsyncStorage from '@react-native-async-storage/async-storage';
import { AutoQueue, type IStorage } from '@shipbook/core';

/**
 * React Native storage adapter using AsyncStorage
 */
class ReactNativeStorage implements IStorage {
  private arrayQueue = new AutoQueue();

  async setItem(key: string, value: string): Promise<void> {
    await AsyncStorage.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return await AsyncStorage.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  }

  async setObj(key: string, value: object): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  }

  async getObj<T = object>(key: string): Promise<T | undefined> {
    const value = await AsyncStorage.getItem(key);
    if (!value) return undefined;
    return JSON.parse(value) as T;
  }

  async pushArrayObj(key: string, value: object | object[]): Promise<void> {
    return this.arrayQueue.enqueue(async () => {
      const sizeString = await AsyncStorage.getItem(`${key}_size`);
      let size = Number(sizeString ?? '0');

      const valuePairs: [string, string][] = [];
      
      if (Array.isArray(value)) {
        for (const v of value) {
          valuePairs.push([`${key}_${size}`, JSON.stringify(v)]);
          ++size;
        }
      } else {
        valuePairs.push([`${key}_${size}`, JSON.stringify(value)]);
        ++size;
      }

      valuePairs.push([`${key}_size`, size.toString()]);
      await AsyncStorage.multiSet(valuePairs);
    });
  }

  async popAllArrayObj(key: string): Promise<object[]> {
    return this.arrayQueue.enqueue(async () => {
      const sizeString = await AsyncStorage.getItem(`${key}_size`);
      const size = Number(sizeString ?? '0');
      
      if (size === 0) return [];

      const keys: string[] = [];
      for (let i = 0; i < size; ++i) {
        keys.push(`${key}_${i}`);
      }

      const values = await AsyncStorage.multiGet(keys);
      const objects = values.map(value => 
        typeof value[1] === 'string' ? JSON.parse(value[1]) : undefined
      ).filter(Boolean);

      keys.push(`${key}_size`);
      await AsyncStorage.multiRemove(keys);

      return objects;
    }) as Promise<object[]>;
  }

  async arraySize(key: string): Promise<number> {
    return this.arrayQueue.enqueue(async () => {
      const sizeString = await AsyncStorage.getItem(`${key}_size`);
      return Number(sizeString ?? '0');
    }) as Promise<number>;
  }
}

export const storage = new ReactNativeStorage();
