// How a widget reads and writes the node behind it. Usually the rendering IS
// the node: values come from its sockets, an edit is written to them and the
// node runs. But one node can be rendered as several views - each placement of
// a UI template is one - and then the view's values come from its snapshot and
// an edit goes to whoever owns the view, never to the node every view shares.
//
// Widgets pass the `view` they were rendered with (props.templateInstance) and
// leave the difference to these functions.
import PPGraph from '../../classes/GraphClass';
import type PPNode from '../../classes/NodeClass';
import type {
  TemplateInstanceHandle,
  TemplateNodeValues,
} from '../../components/dashboard/templateInstance';
import { isTemplateOwner, TemplateOwner } from '../../utils/templateOwner';

export type WidgetView = TemplateInstanceHandle;

// true when the rendering is the node itself, so it may write node state that
// is not an input value (its size, outputs derived while rendering, ...)
export const ownsNode = (view: WidgetView | undefined): view is undefined =>
  view === undefined;

function getViewOwner(view: WidgetView | undefined): TemplateOwner | undefined {
  const owner = view && PPGraph.currentGraph.getNodeById(view.ownerId);
  return owner && isTemplateOwner(owner) ? owner : undefined;
}

/** What a widget shows for an input: the view's snapshot, else the socket. */
export function readWidgetValue(
  node: PPNode,
  socketName: string,
  view?: WidgetView,
): unknown {
  const snapshot = view?.snapshot;
  return snapshot && socketName in snapshot
    ? snapshot[socketName]
    : node.getInputData(socketName);
}

/**
 * Writes inputs the viewer changed. On the node itself they are set together
 * with `outputs`, and the node runs unless `execute` is false. In a view they
 * go to the owner, which re-runs that view, and the result is the view's
 * previous edits, which undo needs.
 *
 * In a view an edit only sticks on a socket nothing in the graph drives or that
 * a template parameter feeds; any other linked socket is re-written on every
 * pass, which is the rule a linked widget socket follows anyway.
 */
export async function writeWidgetInputs(
  node: PPNode,
  inputs: Record<string, unknown>,
  view?: WidgetView,
  {
    outputs = {},
    execute = true,
  }: { outputs?: Record<string, unknown>; execute?: boolean } = {},
): Promise<TemplateNodeValues | undefined> {
  const owner = getViewOwner(view);
  if (owner) {
    return owner.applyTemplateEdit(view?.rowKey, node.id, inputs, view?.parent);
  }
  Object.entries(inputs).forEach(([name, value]) =>
    node.setInputData(name, value),
  );
  Object.entries(outputs).forEach(([name, value]) =>
    node.setOutputData(name, value),
  );
  if (execute) {
    await node.executeOptimizedChain();
  }
  return undefined;
}

/**
 * Undoes writeWidgetInputs: in a view, restores the edits it resolved to;
 * otherwise `rewrite` writes the previous value back.
 */
export async function undoWidgetWrite(
  view: WidgetView | undefined,
  previous: unknown,
  rewrite: (previous: unknown) => Promise<unknown>,
): Promise<void> {
  const owner = getViewOwner(view);
  if (owner) {
    await owner.restoreRowEdits(
      view?.rowKey,
      previous as TemplateNodeValues,
      view?.parent,
    );
  } else {
    await rewrite(previous);
  }
}

/**
 * Runs `action` while the view's values are in the node, so what it triggers
 * sees them. Nothing runs for a view whose owner is gone.
 */
export async function runInWidgetView(
  view: WidgetView,
  action: () => Promise<void>,
): Promise<void> {
  await getViewOwner(view)?.runInTemplateRow(view.rowKey, action, view.parent);
}
