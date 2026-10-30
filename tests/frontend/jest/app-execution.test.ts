import {
  appExecutionAllowed,
  appRisksAccepted,
  isNodeExecutionAllowed,
} from '../../../src/services/appExecution';
import {
  ExternalImageRisk,
  UnrestrictedCodeRisk,
} from '../../../src/classes/NodeRisk';

function node(risks = [], upstream = []) {
  return {
    getRisks: () => risks,
    getAllInputSockets: () =>
      upstream.map((parent) => ({
        links: [{ getSource: () => ({ getNode: () => parent }) }],
      })),
  } as any;
}

afterEach(() => {
  appExecutionAllowed.set(true);
  appRisksAccepted.set(true);
});

it('keeps every node paused during graph construction', () => {
  appExecutionAllowed.set(false);
  expect(isNodeExecutionAllowed(node())).toBe(false);
});

it('checks only the executing node while risks await acceptance', () => {
  appRisksAccepted.set(false);
  const safe = node([new ExternalImageRisk('https://example.com/image.png')]);
  const risky = node([new UnrestrictedCodeRisk()]);
  const dependent = node([], [risky]);
  expect(isNodeExecutionAllowed(safe)).toBe(true);
  expect(isNodeExecutionAllowed(node([], [safe]))).toBe(true);
  expect(isNodeExecutionAllowed(risky)).toBe(false);
  expect(isNodeExecutionAllowed(dependent)).toBe(true);
  expect(isNodeExecutionAllowed(node([], [safe, dependent]))).toBe(true);
  appRisksAccepted.set(true);
  expect(isNodeExecutionAllowed(risky)).toBe(true);
  expect(isNodeExecutionAllowed(dependent)).toBe(true);
});

it('checks current risks after edits without traversing connections', () => {
  appRisksAccepted.set(false);
  const risks = [];
  const upstream = [];
  const first = node(risks, upstream);
  const second = node([], [first]);
  upstream.push(second);
  expect(isNodeExecutionAllowed(second)).toBe(true);
  risks.push(new UnrestrictedCodeRisk());
  expect(isNodeExecutionAllowed(first)).toBe(false);
  expect(isNodeExecutionAllowed(second)).toBe(true);
});
