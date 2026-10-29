// Running a UI template once "as a placement".
//
// The nodes inside a template frame are single shared copies, exactly as a
// macro's are: a pass writes this placement's arguments into the template's
// parameter output sockets, runs the nodes they feed, and then captures what
// each node rendered by the template's body surface ended up with. That
// capture - one input object per node - is what the placement renders from, so
// N placements can show N different things without anything being duplicated.
//
// Same shape as Macro.executeMacro (write args, executeChildren, read back),
// and worth collapsing into one shared helper once a second caller needs it.
import FlowLogic from '../../classes/FlowLogic';
import { AnyType } from '../datatypes/anyType';
import PPGraph from '../../classes/GraphClass';
import { registerTemplateInnerNodes } from '../../utils/templatePass';
import PPNode from '../../classes/NodeClass';
import {
  emptyTemplateCapture,
  TemplateInstanceCapture,
  TemplateNodeValues,
  TemplateRowEdits,
} from '../../components/dashboard/templateInstance';
import {
  getEmbeddedSurfaceNodes,
  getLinkedSourceNodeIds,
  SurfaceSync,
} from './surfaceSync';
import type { UITemplate } from './uiTemplateNode';
import type { UISurfaceNode } from './uiSurface';

// arguments keyed by the template's parameter socket name - never by
// position, because the parameter list has gaps (an unlinked parameter in the
// middle, and the spare one at the end)
export type TemplateArgs = Record<string, unknown>;

// Passes share the template's sockets, so two of them must never interleave.
// Macro has the same exposure today and no guard; this keeps placements honest
// without changing macro behaviour.
let passQueue: Promise<unknown> = Promise.resolve();

// every surface the body renders, following embedded surfaces so a template
// built out of nested surfaces is captured whole
function getRenderedSurfaces(surface: UISurfaceNode): UISurfaceNode[] {
  const collected: UISurfaceNode[] = [surface];
  const seen = new Set<string>([surface.id]);
  for (let i = 0; i < collected.length; i++) {
    getEmbeddedSurfaceNodes(collected[i]).forEach((child) => {
      if (!seen.has(child.id)) {
        seen.add(child.id);
        collected.push(child);
      }
    });
  }
  return collected;
}

async function runPass(
  template: UITemplate,
  args: TemplateArgs,
  edits: TemplateRowEdits,
): Promise<TemplateInstanceCapture> {
  template.getParameterSockets().forEach((parameter) => {
    // A parameter SEEDS the row, and then yields to it. If the viewer has
    // edited a socket this parameter feeds, the edit is written into the
    // parameter itself, so it survives the propagation that executeChildren
    // does below - otherwise the parameter would overwrite the edit on every
    // pass and a value could be shown from data or edited, never both.
    const edited = parameter.links
      .map((link) => {
        const target = link.getTarget();
        return edits.edits[target.getNode().id]?.[target.name];
      })
      .find((value) => value !== undefined);
    if (edited !== undefined) {
      parameter.data = edited;
      return;
    }
    if (Object.prototype.hasOwnProperty.call(args, parameter.name)) {
      parameter.data = args[parameter.name];
    }
  });

  // Baseline first, then this row's edits over it. The baseline matters as
  // much as the edits: the inner nodes are shared, so without it a row that
  // was never edited would start from whatever the previous row left behind.
  //
  // Both are written before the inner nodes run, so they propagate like any
  // other input. A socket the graph drives is re-written during
  // executeChildren and the edit does not stick - the same rule a linked
  // widget socket already follows outside a template.
  const write = (values: TemplateNodeValues) =>
    Object.entries(values).forEach(([nodeId, bySocket]) => {
      const node = PPGraph.currentGraph.getNodeById(nodeId);
      if (!node) {
        return;
      }
      Object.entries(bySocket).forEach(([socketName, value]) => {
        const target = node.getInputSocketByName(socketName);
        // A socket the graph drives takes its value from whatever feeds it.
        // Writing the baseline here would clobber the parameter that is about
        // to propagate - and an edit on such a socket is already carried by
        // the parameter itself (see the seed-then-yield above).
        if (target && !target.hasLink()) {
          node.setInputData(socketName, value);
        }
      });
    });
  write(edits.baseline);
  write(edits.edits);

  // everything the parameters reach is shared between rows, so none of it may
  // let its socket types drift with one row's data
  // A node wired up before it was known to be part of a template may carry a
  // socket type taken from one value that happened to pass through it. That
  // type describes nothing, and from here on the socket will not adapt again,
  // so clear it once as the node joins.
  registerTemplateInnerNodes([
    // the template too: its Output sockets adapt, and they take whatever the
    // last row put through them just like the inner nodes do
    template.id,
    // the whole connected branch, as Macro does for its content: a node two
    // hops downstream (the one that picks which widget's value to report) is
    // just as much part of the template as the widgets themselves
    ...FlowLogic.getAllUpDownstreamNodes(template, true, true, true).map(
      (node) => node.id,
    ),
  ]).forEach((nodeId) => {
    const node = PPGraph.currentGraph.getNodeById(nodeId);
    node?.getAllSockets().forEach((socket) => {
      if (
        node.socketShouldAutomaticallyAdapt(socket) &&
        !(socket.dataType instanceof AnyType)
      ) {
        socket.changeSocketDataType(new AnyType());
      }
    });
  });

  await template.executeChildren();

  const capture = emptyTemplateCapture();
  // read before the early return: a template can declare outputs without
  // rendering anything, and those are still this placement's result
  capture.outputs = template.readOutputs();

  const body = template.getBodySurface();
  if (!body) {
    return capture;
  }

  getRenderedSurfaces(body).forEach((surface) => {
    // the tree with THIS pass's visibility and per-element layout baked in -
    // those live on the surface's own sockets, which are shared, so they have
    // to be read now rather than at render time
    capture.trees[surface.id] = SurfaceSync.applyRuntimeOverrides(
      surface,
      surface.getSurfaceTree(),
    );
    getLinkedSourceNodeIds(surface).forEach((nodeId) => {
      const node = PPGraph.currentGraph.getNodeById(nodeId);
      if (node) {
        capture.snapshots[nodeId] = PPNode.remapInput(node.inputSocketArray);
      }
    });
  });
  return capture;
}

export function runTemplateAsInstance(
  template: UITemplate,
  args: TemplateArgs,
  edits: TemplateRowEdits = { baseline: {}, edits: {} },
): Promise<TemplateInstanceCapture> {
  const pass = passQueue.then(() => runPass(template, args, edits));
  passQueue = pass.catch(() => undefined);
  return pass;
}
