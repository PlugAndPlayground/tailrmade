import {
  AGENT_DOCS_HEADING,
  composeDocs,
  getUserFacingDocs,
  renderUserFacingDocs,
} from '../../../src/utils/nodeDocs';

describe('getUserFacingDocs', () => {
  it('returns docs unchanged when there is no agent section', () => {
    expect(getUserFacingDocs('Plain docs.\n\n## Wiring\nConnect it.')).toBe(
      'Plain docs.\n\n## Wiring\nConnect it.',
    );
  });

  it('cuts the agent section off', () => {
    const docs = `Shared behaviour.

${AGENT_DOCS_HEADING}
Call set_socket_value on "Surface".`;
    expect(getUserFacingDocs(docs)).toBe('Shared behaviour.');
  });
});

describe('composeDocs', () => {
  // The case UIModalNode hits: its base class (UISurfaceNode) ends in an agent
  // section, so a plain template-literal append would hide the subclass's own
  // user-facing sections below that heading.
  it('keeps subclass user sections above the merged agent section', () => {
    const base = `Base behaviour.

${AGENT_DOCS_HEADING}
base_tool takes a node id.`;
    const own = '## Opening\nWire an output to "Open Dialog".';

    const composed = composeDocs(base, own);

    expect(getUserFacingDocs(composed)).toBe(
      'Base behaviour.\n\n## Opening\nWire an output to "Open Dialog".',
    );
    expect(composed.indexOf('## Opening')).toBeLessThan(
      composed.indexOf(AGENT_DOCS_HEADING),
    );
    expect(composed).toContain('base_tool takes a node id.');
  });

  it('merges agent sections from several parts into one', () => {
    const composed = composeDocs(
      `A.\n\n${AGENT_DOCS_HEADING}\nfirst_tool.`,
      `B.\n\n${AGENT_DOCS_HEADING}\nsecond_tool.`,
    );

    expect(composed.match(/## For the agent/g)).toHaveLength(1);
    expect(composed).toContain('first_tool.');
    expect(composed).toContain('second_tool.');
    expect(getUserFacingDocs(composed)).toBe('A.\n\nB.');
  });

  it('emits no agent heading when no part has one', () => {
    expect(composeDocs('A.', 'B.')).toBe('A.\n\nB.');
  });
});

describe('renderUserFacingDocs', () => {
  it('renders markdown links so they leave the app', () => {
    const html = renderUserFacingDocs(
      'See [reveal.js](https://revealjs.com/).',
    );
    expect(html).toContain('href="https://revealjs.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain('reveal.js');
  });

  it('never renders the agent section', () => {
    const html = renderUserFacingDocs(
      `Visible.\n\n${AGENT_DOCS_HEADING}\ndisconnect_sockets takes a widget off.`,
    );
    expect(html).toContain('Visible.');
    expect(html).not.toContain('disconnect_sockets');
    expect(html).not.toContain('For the agent');
  });

  it('returns an empty string for a node without docs', () => {
    expect(renderUserFacingDocs('')).toBe('');
  });
});

describe('angle-bracket placeholders', () => {
  // Docs are markdown, never HTML. Without escaping, "<name> visible" parses as
  // a tag and the browser drops it, so the inspector would show " visible".
  it('renders placeholders literally instead of dropping them', () => {
    const html = renderUserFacingDocs('Set "<name> visible" to false.');
    expect(html).toContain('&lt;name&gt; visible');
  });

  it('escapes a placeholder that opens a line', () => {
    const html = renderUserFacingDocs('- <child name> visible controls it.');
    expect(html).toContain('&lt;child name&gt; visible');
  });
});
