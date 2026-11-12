import { createStore } from '../components/createStore';
import type PPNode from '../classes/NodeClass';

// Session-only: a graph file cannot grant itself execution permission.
export const appExecutionAllowed = createStore(true);
export const appRisksAccepted = createStore(true);

export function isNodeExecutionAllowed(node: PPNode): boolean {
  return (
    appExecutionAllowed.get() &&
    (appRisksAccepted.get() ||
      (!node.deferUntilAppApproved &&
        node.getRisks().every((risk) => risk.severity === 'info')))
  );
}

export function useNodeExecutionAllowed(node: PPNode): boolean {
  appExecutionAllowed.useStore();
  appRisksAccepted.useStore();
  return isNodeExecutionAllowed(node);
}

export const pendingAppRun = createStore<{
  name: string;
  run: () => Promise<void>;
} | null>(null);

// Input values a link asks to set on the app it opens. They are applied while
// the app loads, before anything runs and before the review reads the app, so
// they are reviewed like the rest of it and cannot ride on an earlier approval.
export type LinkSocketData = { node: string; socket: string; data: unknown };
let linkSocketData: LinkSocketData[] = [];

export function setLinkSocketData(data: LinkSocketData[]): void {
  linkSocketData = data;
}

export function takeLinkSocketData(): LinkSocketData[] {
  const data = linkSocketData;
  linkSocketData = [];
  return data;
}
