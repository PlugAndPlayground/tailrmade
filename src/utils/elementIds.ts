// Dashboard (craft.js) element ids are flat strings: "NODE_<nodeId>" for a
// widget item and "SOCKET_<nodeId>::<socketType>::<socketName>" for a socket
// item. The "::" separator is reserved: node ids must never contain it (see
// NodeClass), which makes parsing exact - the first two separators always
// delimit nodeId and socketType (an enum value), and everything after the
// second one is the socket name, so socket names themselves stay
// unrestricted.
//
// The previous production format used "-" as the separator and required
// node ids to be human-readable-ids (word-word-number) so a regex could
// split unambiguously - which silently broke socket widgets of any node
// whose id had another shape. graphMigrations.ts rewrites persisted trees
// to the current format on load, using parseLegacyElementId below.
//
// This module is deliberately free of pixi.js/graph imports so it stays
// importable from jest tests and graphMigrations.ts (see constants_shared.ts
// for the same rule).
import { SOCKET_TYPE } from './constants_shared';
import type { TNodeId, TSocketId, TSocketType } from './interfaces';

export const NODE_ELEMENT_ID_PREFIX = 'NODE_';
export const SOCKET_ELEMENT_ID_PREFIX = 'SOCKET_';
// reserved in node ids; hri.random() and ai-node-<n> can never produce it
export const ELEMENT_ID_SEPARATOR = '::';

const SOCKET_TYPES = Object.values(SOCKET_TYPE) as TSocketType[];

export type TParsedElementId =
  | { kind: 'node'; nodeId: string }
  | {
      kind: 'socket';
      nodeId: string;
      socketType: TSocketType;
      socketName: string;
    };

export const constructSocketId = (
  nodeId: TNodeId,
  socketType: TSocketType,
  socketName: string,
): TSocketId => {
  return `SOCKET_${nodeId}${ELEMENT_ID_SEPARATOR}${socketType}${ELEMENT_ID_SEPARATOR}${socketName}`;
};

/**
 * Splits a dashboard element id back into its parts. Exact - no graph
 * knowledge needed. Returns undefined for ids that carry neither prefix,
 * malformed socket ids, and unknown socket types.
 */
export function parseElementId(
  elementId: string,
): TParsedElementId | undefined {
  if (elementId.startsWith(NODE_ELEMENT_ID_PREFIX)) {
    const nodeId = elementId.slice(NODE_ELEMENT_ID_PREFIX.length);
    return nodeId ? { kind: 'node', nodeId } : undefined;
  }
  if (!elementId.startsWith(SOCKET_ELEMENT_ID_PREFIX)) {
    return undefined;
  }
  const rest = elementId.slice(SOCKET_ELEMENT_ID_PREFIX.length);
  const firstSep = rest.indexOf(ELEMENT_ID_SEPARATOR);
  if (firstSep <= 0) {
    return undefined;
  }
  const typeStart = firstSep + ELEMENT_ID_SEPARATOR.length;
  const secondSep = rest.indexOf(ELEMENT_ID_SEPARATOR, typeStart);
  if (secondSep === -1) {
    return undefined;
  }
  const socketType = rest.slice(typeStart, secondSep) as TSocketType;
  if (!SOCKET_TYPES.includes(socketType)) {
    return undefined;
  }
  const socketName = rest.slice(secondSep + ELEMENT_ID_SEPARATOR.length);
  if (!socketName) {
    return undefined;
  }
  return {
    kind: 'socket',
    nodeId: rest.slice(0, firstSep),
    socketType,
    socketName,
  };
}

/**
 * Parses a pre-"::" socket element id, exactly as production did before the
 * separator was reserved: "SOCKET_<nodeId>-<socketType>-<socketName>" where
 * the node id is required to have the human-readable-id shape
 * (word-word-number, which "ai-node-<n>" also matches). Only used by
 * graphMigrations.ts to rewrite persisted trees. Ids this regex rejects
 * never resolved (and never rendered) under the old regime either, so the
 * migration leaves them untouched.
 */
const LEGACY_SOCKET_ID_PATTERN =
  /^SOCKET_([a-z]+-[a-z]+-\d+)-([a-zA-Z]+)-(.+)$/;

export function parseLegacyElementId(
  elementId: string,
): TParsedElementId | undefined {
  const match = LEGACY_SOCKET_ID_PATTERN.exec(elementId);
  if (!match) {
    return undefined;
  }
  const [, nodeId, socketType, socketName] = match;
  if (!SOCKET_TYPES.includes(socketType as TSocketType)) {
    return undefined;
  }
  return {
    kind: 'socket',
    nodeId,
    socketType: socketType as TSocketType,
    socketName,
  };
}
