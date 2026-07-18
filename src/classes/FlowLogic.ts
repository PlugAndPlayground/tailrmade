import debounce from 'lodash/debounce';

import PPGraph from './GraphClass';
import PPNode from './NodeClass';
import Socket from './SocketClass';
import InterfaceController from '../InterfaceController';

// Track if execution is pending and allow waiting for it
let executionPromise: Promise<void> | null = null;
let executionResolve: (() => void) | null = null;

const executePendingExecution = debounce(async () => {
  // filter out deleted nodes
  const nodesToExecute = Array.from(FlowLogic.pendingExecution)
    .map((id) => PPGraph.currentGraph.nodes[id])
    .filter((node) => node !== undefined && !node.destroyed);
  FlowLogic.pendingExecution.clear();

  try {
    await FlowLogic.executeOptimizedChainBatch(nodesToExecute);
  } finally {
    // Resolve the promise when execution completes
    if (executionResolve) {
      executionResolve();
      executionPromise = null;
      executionResolve = null;
    }
  }
}, 16);

// only static functions to manage flow behaviour
export default class FlowLogic {
  static pendingExecution = new Set<string>();

  static addPendingExecution(nodeId: string): void {
    // Create a new execution promise if none exists
    if (!executionPromise) {
      executionPromise = new Promise<void>((resolve) => {
        executionResolve = resolve;
      });
    }

    FlowLogic.pendingExecution.add(nodeId);
    executePendingExecution();
  }

  static waitForPendingExecution(): Promise<void> {
    // If there's a pending execution, return the promise that will resolve when it completes
    // Otherwise, return an immediately resolved promise
    return executionPromise || Promise.resolve();
  }

  static goThroughSockets(
    currDependents: { [key: string]: PPNode },
    socketArray: Socket[],
    upstream = false,
  ): void {
    socketArray.forEach((socket) => {
      Object.values(socket.getLinkedNodes(upstream)).forEach((dependent) => {
        if (dependent !== undefined) {
          currDependents[dependent.id] = dependent;
        }
      });
    });
  }

  static getLinkedNodes(
    node: PPNode,
    includeUpstream = false,
    includeDownstream = true,
  ): { [key: string]: PPNode } {
    const currDependents: { [key: string]: PPNode } = {};

    if (includeUpstream) {
      this.goThroughSockets(currDependents, node.getAllInputSockets(), true);
    }
    if (includeDownstream) {
      this.goThroughSockets(currDependents, node.outputSocketArray);
    }
    return currDependents;
  }

  // needed for those "executechildren" passes
  static getHasDependencyOnOtherFoundationalWithExclusion(
    node: PPNode,
    foundational: PPNode[],
    optionalExcludedNode: string,
  ): boolean {
    const aggregated = new Set();
    let current = node;
    let next = [];
    while (current !== undefined) {
      aggregated.add(current.id);
      const nextNodes = current.inputSocketArray
        .filter((socket) => socket.hasLink())
        .map((socket) => socket.links[0].getSource().getNode());
      const filtered = nextNodes.filter(
        (node) => node.id != optionalExcludedNode && !aggregated.has(node.id),
      );
      next = next.concat(filtered);
      current = next.pop();
    }
    const hasDependency =
      foundational.find((f) => aggregated.has(f.id) && f.id !== node.id) !==
      undefined;

    return hasDependency;
  }

  static MAX_ITERATIONS = 10000;
  static async executeOptimizedChainBatch(
    foundational: PPNode[],
    excludedParent: string = undefined, // this sucks man
  ): Promise<void> {
    // if it turns out that any of the foundationals are dependent on some other of them, remove from foundational (they will get called later because they apparently are part of child chain)
    const foundationalOriginalSet: Set<string> = new Set(
      foundational.map((node) => node.id),
    );
    const foundationalPost = foundational.filter(
      (node) =>
        !this.getHasDependencyOnOtherFoundationalWithExclusion(
          node,
          foundational,
          excludedParent,
        ),
    );
    // which nodes depend on which others
    const dependencyGraph = FlowLogic.buildDependencyGraph(
      foundationalPost,
      foundationalOriginalSet,
      excludedParent,
    );

    // now that we have the complete chain, execute them in order that makes sure all dependents are waiting on their parents, there should always be a node with no more lingering dependents (unless there is an infinite loop)
    //let currentExecuting: PPNode = foundational.shift();
    const hasExecuted = new Set<string>();

    foundationalPost.sort((a, b) => a.executionOrder() - b.executionOrder());
    let currentExecuting = foundationalPost.shift();
    while (currentExecuting) {
      await currentExecuting.execute();
      hasExecuted.add(currentExecuting.id);
      // uncomment if you want to see the execution visually by slowing it down (to make sure order is correct)
      //console.log('executing: ' + currentExecuting.getName());
      //await new Promise((resolve) => setTimeout(resolve, 100));
      Object.keys(currentExecuting.getDirectDependents()).forEach(
        (dependentKey) => {
          if (dependencyGraph[dependentKey] !== undefined) {
            dependencyGraph[dependentKey].delete(currentExecuting.id);
            if (
              dependencyGraph[dependentKey].size == 0 &&
              (PPGraph.currentGraph.nodes[dependentKey].updateBehaviour
                .update ||
                foundationalOriginalSet.has(dependentKey)) &&
              !hasExecuted.has(dependentKey) &&
              dependentKey !== excludedParent
            ) {
              foundationalPost.push(PPGraph.currentGraph.nodes[dependentKey]);
            }
          }
        },
      );

      do {
        foundationalPost.sort(
          (a, b) => a.executionOrder() - b.executionOrder(),
        );
        currentExecuting = foundationalPost.shift();
      } while (currentExecuting && hasExecuted.has(currentExecuting.id));
    }
    return;
  }

  // filteredfoundational are passed so that if they dont have "update" enabled they will still be included here
  static buildDependencyGraph(
    foundational: PPNode[],
    filteredFoundational: Set<string>,
    excludedParent: string | undefined,
  ): {
    [key: string]: Set<string>;
  } {
    // figure out which nodes need which other to be executed before them
    const hasChecked = new Set();
    let currIteration = foundational;
    const dependencyGraph: Record<string, Set<string>> = {};
    while (currIteration.length) {
      const nextIteration: PPNode[] = [];
      currIteration.forEach((node) => {
        node.outputSocketArray.forEach((socket) => {
          const targets = socket.getSocketDependents(true);
          targets.forEach((childSocket: Socket) => {
            const child = childSocket.getNode();
            if (dependencyGraph[child.id] === undefined) {
              dependencyGraph[child.id] = new Set();
            }
            dependencyGraph[child.id].add(node.id);

            if (
              !hasChecked.has(childSocket.name + child.id) &&
              (child.updateBehaviour.update ||
                filteredFoundational.has(child.id)) &&
              child.id !== excludedParent &&
              child.shouldPropagateExecutionThrough(childSocket)
            ) {
              nextIteration.push(child);
            }
            hasChecked.add(childSocket.name + child.id);
          });
        });
      });

      currIteration = nextIteration;
    }
    return dependencyGraph;
  }

  static getAllUpDownstreamNodes(
    node: PPNode,
    includeUpstream: boolean,
    includeDownstream: boolean,
    wholeBranch: boolean, // includes the whole up/downstream branch
  ): PPNode[] {
    const getDirectDependentsAndAccumulateThem = (
      dependents: {
        [key: string]: PPNode;
      },
      includeUpstream: boolean,
      includeDownstream: boolean,
      wholeBranch: boolean,
    ): void => {
      Object.values(dependents).forEach((node) => {
        const newDependents: { [key: string]: PPNode } =
          FlowLogic.getLinkedNodes(
            node,
            wholeBranch || includeUpstream,
            wholeBranch || includeDownstream,
          );

        combinedDependents[node.id] = node;

        const filtered = Object.keys(newDependents)
          .filter((key) => combinedDependents[key] === undefined)
          .reduce((obj, key) => {
            obj[key] = newDependents[key];
            return obj;
          }, {});

        getDirectDependentsAndAccumulateThem(
          filtered,
          includeUpstream,
          includeDownstream,
          wholeBranch,
        );
      });
    };

    const combinedDependents: { [key: string]: PPNode } = {};
    combinedDependents[node.id] = node;

    if (includeUpstream && includeDownstream) {
      getDirectDependentsAndAccumulateThem(
        combinedDependents,
        includeUpstream,
        includeDownstream,
        wholeBranch,
      );
    } else {
      getDirectDependentsAndAccumulateThem(
        FlowLogic.getLinkedNodes(node, includeUpstream, includeDownstream),
        includeUpstream,
        includeDownstream,
        wholeBranch,
      );
    }
    return Object.values(combinedDependents);
  }
}
