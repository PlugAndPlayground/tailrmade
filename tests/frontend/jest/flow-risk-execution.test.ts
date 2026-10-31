jest.mock('../../../src/classes/GraphClass', () => ({
  __esModule: true,
  default: { currentGraph: { nodes: {} } },
}));
jest.mock('../../../src/InterfaceController', () => ({
  __esModule: true,
  default: {},
}));

import FlowLogic from '../../../src/classes/FlowLogic';
import PPGraph from '../../../src/classes/GraphClass';
import { UnrestrictedCodeRisk } from '../../../src/classes/NodeRisk';
import {
  appExecutionAllowed,
  appRisksAccepted,
} from '../../../src/services/appExecution';
import { resetNodePasteTrust } from '../../../src/services/nodePasteTrust';

function node(id: string, risky = false) {
  const result = {
    id,
    destroyed: false,
    deferUntilAppApproved: false,
    risks: risky ? [new UnrestrictedCodeRisk()] : [],
    inputSocketArray: [],
    outputSocketArray: [],
    dependents: {},
    updateBehaviour: { load: false, update: true },
    getRisks: () => result.risks,
    executionOrder: () => 0,
    execute: jest.fn().mockResolvedValue(undefined),
    getDirectDependents: () => result.dependents,
    shouldPropagateExecutionThrough: () => true,
  };
  PPGraph.currentGraph.nodes[id] = result as any;
  return result;
}

function connect(
  parent: ReturnType<typeof node>,
  child: ReturnType<typeof node>,
) {
  const input = {
    name: parent.id,
    getNode: () => child,
    hasLink: () => true,
    links: [{ getSource: () => ({ getNode: () => parent }) }],
  };
  child.inputSocketArray.push(input);
  parent.outputSocketArray.push({ getSocketDependents: () => [input] });
  parent.dependents[child.id] = child;
}

beforeEach(() => {
  PPGraph.currentGraph.nodes = {};
  appExecutionAllowed.set(true);
  appRisksAccepted.set(false);
  FlowLogic.clearPausedExecutions();
  resetNodePasteTrust();
});

afterEach(() => {
  appExecutionAllowed.set(true);
  appRisksAccepted.set(true);
  FlowLogic.clearPausedExecutions();
});

it('stops at an unaccepted node and resumes its chain without replaying completed branches', async () => {
  const source = node('source');
  const risky = node('risky', true);
  const child = node('child');
  const sibling = node('sibling');
  const join = node('join');
  connect(source, risky);
  connect(risky, child);
  connect(source, sibling);
  connect(child, join);
  connect(sibling, join);

  await FlowLogic.executeOptimizedChainBatch([source] as any);
  expect(source.execute).toHaveBeenCalledTimes(1);
  expect(sibling.execute).toHaveBeenCalledTimes(1);
  expect(risky.execute).not.toHaveBeenCalled();
  expect(child.execute).not.toHaveBeenCalled();
  expect(join.execute).not.toHaveBeenCalled();

  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(source.execute).toHaveBeenCalledTimes(1);
  expect(sibling.execute).toHaveBeenCalledTimes(1);
  expect(risky.execute).toHaveBeenCalledTimes(1);
  expect(child.execute).toHaveBeenCalledTimes(1);
  expect(join.execute).toHaveBeenCalledTimes(1);
  await FlowLogic.resumePausedExecutions();
  expect(risky.execute).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  'resumes a macro caller with complete results (mapped: %s)',
  async (mapped) => {
    const source = node('source');
    const caller = node('caller');
    caller.deferUntilAppApproved = true;
    const inner = node('inner', true);
    const child = node('child');
    connect(source, caller);
    connect(caller, child);
    const inputs = mapped ? [4, 8] : [4];
    let input = 0;
    let innerResult = 0;
    const outputs: number[] = [];
    let received: number[] = [];
    inner.execute.mockImplementation(async () => {
      innerResult = input * 3;
    });
    caller.execute.mockImplementation(async () => {
      for (input of inputs) {
        await FlowLogic.executeOptimizedChainBatch([inner] as any, 'macro');
        outputs.push(innerResult);
      }
    });
    child.execute.mockImplementation(async () => {
      received = [...outputs];
    });

    await FlowLogic.executeOptimizedChainBatch([source] as any);
    expect(caller.execute).not.toHaveBeenCalled();
    expect(inner.execute).not.toHaveBeenCalled();
    expect(child.execute).not.toHaveBeenCalled();

    appRisksAccepted.set(true);
    await FlowLogic.resumePausedExecutions();
    expect(received).toEqual(inputs.map((value) => value * 3));
    expect(source.execute).toHaveBeenCalledTimes(1);
    expect(caller.execute).toHaveBeenCalledTimes(1);
    expect(inner.execute).toHaveBeenCalledTimes(inputs.length);
    expect(child.execute).toHaveBeenCalledTimes(1);
    await FlowLogic.resumePausedExecutions();
    expect(caller.execute).toHaveBeenCalledTimes(1);
  },
);

it('can start at a safe node downstream of an unaccepted node', async () => {
  const risky = node('risky', true);
  const child = node('child');
  connect(risky, child);
  await FlowLogic.executeOptimizedChainBatch([child] as any);
  expect(child.execute).toHaveBeenCalledTimes(1);
  expect(risky.execute).not.toHaveBeenCalled();
});

it('throws when a connected dependent is missing from the graph', async () => {
  const source = node('source');
  const child = node('child');
  connect(source, child);
  delete PPGraph.currentGraph.nodes[child.id];

  await expect(
    FlowLogic.executeOptimizedChainBatch([source] as any),
  ).rejects.toThrow(TypeError);
});

it('coalesces repeated attempts to run the same blocked chain', async () => {
  const source = node('source');
  const risky = node('risky', true);
  const child = node('child');
  connect(source, risky);
  connect(risky, child);
  await FlowLogic.executeOptimizedChainBatch([source] as any);
  await FlowLogic.executeOptimizedChainBatch([source] as any);
  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(source.execute).toHaveBeenCalledTimes(2);
  expect(risky.execute).toHaveBeenCalledTimes(1);
  expect(child.execute).toHaveBeenCalledTimes(1);
});

it('checks risks when execution reaches a node', async () => {
  const source = node('source');
  const child = node('child');
  connect(source, child);
  source.execute.mockImplementation(async () => {
    child.risks.push(new UnrestrictedCodeRisk());
  });
  await FlowLogic.executeOptimizedChainBatch([source] as any);
  expect(source.execute).toHaveBeenCalledTimes(1);
  expect(child.execute).not.toHaveBeenCalled();
  await FlowLogic.resumePausedExecutions();
  expect(child.execute).not.toHaveBeenCalled();
  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(child.execute).toHaveBeenCalledTimes(1);
});

it('preserves explicitly requested nodes with updates disabled across approval', async () => {
  const risky = node('risky', true);
  const child = node('child');
  child.updateBehaviour.update = false;
  connect(risky, child);
  await FlowLogic.executeOptimizedChainBatch([risky, child] as any);
  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(risky.execute).toHaveBeenCalledTimes(1);
  expect(child.execute).toHaveBeenCalledTimes(1);
});

it('preserves the excluded parent when resuming a chain', async () => {
  const parent = node('parent');
  const risky = node('risky', true);
  connect(parent, risky);
  connect(risky, parent);
  await FlowLogic.executeOptimizedChainBatch([risky] as any, parent.id);
  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(risky.execute).toHaveBeenCalledTimes(1);
  expect(parent.execute).not.toHaveBeenCalled();
});

it.each(['cleared', 'replaced', 'deleted'])(
  'discards a %s paused chain',
  async (reason) => {
    const risky = node('risky', true);
    const child = node('child');
    connect(risky, child);
    await FlowLogic.executeOptimizedChainBatch([risky] as any);
    if (reason === 'cleared') FlowLogic.clearPausedExecutions();
    if (reason === 'replaced') resetNodePasteTrust();
    if (reason === 'deleted') risky.destroyed = true;
    appRisksAccepted.set(true);
    await FlowLogic.resumePausedExecutions();
    expect(risky.execute).not.toHaveBeenCalled();
    expect(child.execute).not.toHaveBeenCalled();
  },
);

it('does not queue execution while a graph is being constructed', async () => {
  appExecutionAllowed.set(false);
  const source = node('source');
  await FlowLogic.executeOptimizedChainBatch([source] as any);
  appExecutionAllowed.set(true);
  appRisksAccepted.set(true);
  await FlowLogic.resumePausedExecutions();
  expect(source.execute).not.toHaveBeenCalled();
});
