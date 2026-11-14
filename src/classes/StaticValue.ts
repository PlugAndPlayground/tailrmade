import isEqual from 'lodash/isEqual';
import type Socket from './SocketClass';

export type StaticValue =
  { known: true; value: unknown } | { known: false; value: undefined };

export const UNKNOWN_STATIC_VALUE: StaticValue = {
  known: false,
  value: undefined,
};

export function resolveStaticInput(
  socket: Socket,
  visited = new Set<Socket>(),
): StaticValue {
  if (visited.has(socket)) return UNKNOWN_STATIC_VALUE;
  if (!socket.links.length) return { known: true, value: socket.data };
  const source = socket.links[0].getSource();
  const next = new Set(visited).add(socket);
  const resolved = source.getNode().getStaticOutputData(source.name, next);
  if (!resolved.known) return UNKNOWN_STATIC_VALUE;
  const value = socket.dataType.parse(resolved.value).value;
  // The node reads the socket, not this prediction. A source that has not
  // run, or delivered something else, leaves the two apart.
  return isEqual(socket.data, value)
    ? { known: true, value }
    : UNKNOWN_STATIC_VALUE;
}
