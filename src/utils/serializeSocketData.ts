export function serializeSocketData(socket: {
  name: string;
  data: any;
  dataType: { prepareDataForSaving(data: any): any };
}): any {
  try {
    return structuredClone(socket.dataType.prepareDataForSaving(socket.data));
  } catch (error) {
    // Runtime values such as Promises cannot be included in undo/save snapshots.
    console.warn(
      `Could not serialize data for socket "${socket.name}"; omitting its value.`,
      error,
    );
    return undefined;
  }
}
