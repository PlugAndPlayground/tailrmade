import {
  isLocalNodePaste,
  registerLocalSelection,
  rememberCopiedSelection,
  resetNodePasteTrust,
} from '../../../src/services/nodePasteTrust';

const selection = () =>
  ({ version: 1, nodes: [{ id: 'node', code: 'original' }], links: [] }) as any;

beforeEach(resetNodePasteTrust);

it('exempts unchanged local duplication and copies from the current app', () => {
  const data = selection();
  expect(isLocalNodePaste(data)).toBe(false);
  registerLocalSelection(data);
  expect(isLocalNodePaste(data)).toBe(true);
  expect(isLocalNodePaste(JSON.parse(JSON.stringify(data)))).toBe(false);
  rememberCopiedSelection(data);
  expect(isLocalNodePaste(JSON.parse(JSON.stringify(data)))).toBe(true);
  data.nodes[0].code = 'changed';
  expect(isLocalNodePaste(data)).toBe(false);
});

it('forgets copied content and local selections when apps change', () => {
  const data = selection();
  registerLocalSelection(data);
  rememberCopiedSelection(data);
  resetNodePasteTrust();
  expect(isLocalNodePaste(data)).toBe(false);
  expect(isLocalNodePaste({ ...data, trusted: true })).toBe(false);
});
