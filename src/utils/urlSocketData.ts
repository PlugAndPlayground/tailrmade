import type { URLSetSocketData } from '../nodes/state/storage';

// Anyone can craft a link, so links may only change plain data. These sockets
// decide what an app runs, or where it sends data and API keys.
const PROTECTED_SOCKET_NAMES = new Set([
  'Main Thread',
  'Sanitize input',
  'Send Through Companion',
  'Headers',
  'URL',
  'Body',
  'Package Name',
  'Location',
]);
const CODE_TYPE_NAMES = new Set(['Code', 'Html']);
const VALUE_PREVIEW_LENGTH = 120;

export type URLSocketDataRefusal = 'code' | 'protected';

export interface URLSocketChange {
  nodeName: string;
  socketName: string;
  data: unknown;
}

interface TargetSocket {
  name: string;
  dataType: { getName(): string };
}

export const parseURLSocketData = (
  raw: string,
): URLSetSocketData[] | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }
  // "Copy Socket Reference" copies a single entry, so accept that too
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const isEntry = (entry: any) =>
    typeof entry?.node === 'string' && typeof entry?.socket === 'string';
  return entries.every(isEntry) ? entries : undefined;
};

export const getURLSocketDataRefusal = (
  socket: TargetSocket,
): URLSocketDataRefusal | undefined => {
  if (CODE_TYPE_NAMES.has(socket.dataType.getName())) return 'code';
  if (PROTECTED_SOCKET_NAMES.has(socket.name)) return 'protected';
  return undefined;
};

export const partitionURLSocketData = <T extends TargetSocket>(
  entries: URLSetSocketData[],
  findSocket: (entry: URLSetSocketData) => T | undefined,
): {
  allowed: { entry: URLSetSocketData; socket: T }[];
  refusals: URLSocketDataRefusal[];
} => {
  const allowed: { entry: URLSetSocketData; socket: T }[] = [];
  const refusals: URLSocketDataRefusal[] = [];
  entries.forEach((entry) => {
    const socket = findSocket(entry);
    if (!socket) {
      console.warn(
        `Link targets a missing socket: ${entry.node}/${entry.socket}`,
      );
      return;
    }
    const refusal = getURLSocketDataRefusal(socket);
    if (refusal) {
      refusals.push(refusal);
    } else {
      allowed.push({ entry, socket });
    }
  });
  return { allowed, refusals };
};

export const getURLSocketDataRefusalMessage = (
  refusals: URLSocketDataRefusal[],
  appName: string,
): string => {
  const target = refusals.includes('code') ? 'code' : 'a protected setting';
  return `This link tried to change ${target} in ${appName}. Links can't do that, so it opened unchanged.`;
};

export const previewURLSocketValue = (data: unknown): string => {
  const text =
    typeof data === 'string' ? data : (JSON.stringify(data) ?? String(data));
  return text.length > VALUE_PREVIEW_LENGTH
    ? `${text.slice(0, VALUE_PREVIEW_LENGTH)}…`
    : text;
};
