import Socket from './classes/SocketClass';

export interface BackPropagation {
  SocketToGetValue: Socket | undefined;
  SocketToGetOptions?: Socket | undefined;
  SocketToTakeName?: Socket | undefined;
}

export interface BackPropagationPayload {
  SocketToGetOptions?: unknown;
}
