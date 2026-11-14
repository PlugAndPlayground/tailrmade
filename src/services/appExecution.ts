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
