import {
  createToolMarkerRegex,
  stripAIToolMarkers,
} from '../../../src/services/aiToolMarkers';

describe('AI tool markers', () => {
  it.each([
    '*Using set_socket_value...*',
    '*Used set_socket_value.*',
    '*add_node failed: node not found*',
    '*Checking graph warnings and errors before finishing...*',
    '*Looked at the rendered UI.*',
    '*Completed 3 MCP tool call(s).*',
    '*Completed 3 MCP tool call(s). Inspections: describe_node x2.*',
    'Stopped after reaching the MCP turn limit (60) for this request.',
  ])('matches the complete marker %s', (marker) => {
    expect(marker.match(createToolMarkerRegex())).toEqual([marker]);
  });

  it('keeps the captures used by the conversation UI', () => {
    const match = createToolMarkerRegex().exec('*add_node failed: not found*');

    expect(match?.[3]).toBe('add_node');
    expect(match?.[4]).toBe('not found');
  });

  it('removes tool status from assistant history', () => {
    const message = [
      "I'll update the label:",
      '',
      '*Using set_socket_value...*',
      '*Used set_socket_value.*',
      '*Looked at the rendered UI.*',
      '',
      'Done. The label now joins the values with commas.',
      '',
      '*Completed 2 MCP tool call(s). Inspections: describe_node.*',
    ].join('\n');

    expect(stripAIToolMarkers(message)).toBe(
      "I'll update the label:\n\nDone. The label now joins the values with commas.",
    );
  });

  it("does not alter the model's own prose", () => {
    const answer = 'Use a CustomFunction node with items.join(", ").';

    expect(stripAIToolMarkers(answer)).toBe(answer);
  });
});
