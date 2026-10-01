import type { SerializedSelection } from '../utils/interfaces';

let session = 0;
let copied: string | undefined;
let localSelections = new WeakMap<SerializedSelection, string>();

export function resetNodePasteTrust(): void {
  session++;
  copied = undefined;
  localSelections = new WeakMap();
}

export function getNodePasteSession(): number {
  return session;
}

export function registerLocalSelection(data: SerializedSelection): void {
  localSelections.set(data, JSON.stringify(data));
}

export function rememberCopiedSelection(data: SerializedSelection): void {
  copied = JSON.stringify(data);
}

export function isLocalNodePaste(data: SerializedSelection): boolean {
  const content = JSON.stringify(data);
  return content === copied || content === localSelections.get(data);
}
