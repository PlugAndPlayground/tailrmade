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
  return { known: true, value: socket.dataType.parse(resolved.value).value };
}
