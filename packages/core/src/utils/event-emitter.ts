import { EventEmitter } from 'eventemitter3';

export const eventEmitter = new EventEmitter();

// Event names
export const CONFIG_CHANGE = 'io.shipbook.ShipBookSDK.config';
export const CONNECTED = 'io.shipbook.ShipBookSDK.connected';
export const USER_CHANGE = 'io.shipbook.ShipBookSDK.user';
