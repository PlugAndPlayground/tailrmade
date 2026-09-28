import { Marked } from 'marked';

/**
 * Node docs - PPNode.getDocs() - are one markdown string serving both audiences
 * that need more than the one-line getDescription(): the user, in the node
 * inspector, and the AI agent, through the describe_node MCP tool. Splitting
 * the deep layer by depth rather than by audience is what keeps a node's
 * behaviour documented in exactly one place.
 *
 * The rare genuinely agent-only part - MCP tool names, calling conventions -
 * goes under this heading, which must be the last section. The inspector cuts
 * it off; describe_node keeps the whole string.
 */
export const AGENT_DOCS_HEADING = '## For the agent';

const AGENT_DOCS_PATTERN = /^##[ \t]+For the agent[ \t]*$/m;

const splitDocs = (docs: string): { user: string; agent: string } => {
  const agentSection = AGENT_DOCS_PATTERN.exec(docs);
  if (!agentSection) {
    return { user: docs.trim(), agent: '' };
  }
  return {
    user: docs.slice(0, agentSection.index).trim(),
    agent: docs.slice(agentSection.index + agentSection[0].length).trim(),
  };
};

/** The user-facing half of getDocs(): everything above the agent heading. */
export const getUserFacingDocs = (docs: string): string => splitDocs(docs).user;

/**
 * Merges a base class's docs with a subclass's own, keeping each audience's
 * text together and the agent section last. A subclass cannot just interpolate
 * super.getDocs(), because that appends its own user-facing sections below the
 * base class's agent heading, hiding them from the inspector.
 */
export const composeDocs = (...parts: string[]): string => {
  const userParts: string[] = [];
  const agentParts: string[] = [];

  for (const part of parts) {
    const { user, agent } = splitDocs(part);
    if (user) {
      userParts.push(user);
    }
    if (agent) {
      agentParts.push(agent);
    }
  }

  const user = userParts.join('\n\n');
  if (agentParts.length === 0) {
    return user;
  }
  return `${user}\n\n${AGENT_DOCS_HEADING}\n${agentParts.join('\n\n')}`;
};

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const docsMarked = new Marked({
  renderer: {
    // Docs only ever link out of the app.
    link(token) {
      const title = token.title ? ` title="${token.title}"` : '';
      return `<a href="${token.href}"${title} target="_blank" rel="noreferrer">${this.parser.parseInline(token.tokens)}</a>`;
    },
    // Docs are markdown, never HTML, so anything that parses as a tag is a
    // placeholder the author meant literally - "<name> visible" and the like.
    // Escaping it shows the text instead of letting the browser drop it as an
    // unknown element.
    html(token) {
      return escapeHtml(token.text);
    },
  },
});

/**
 * Renders the user-facing half of a node's docs to HTML for the inspector. The
 * markdown comes from our own node source, so it is trusted, not sanitized.
 */
export const renderUserFacingDocs = (docs: string): string =>
  docsMarked.parse(getUserFacingDocs(docs), { async: false });
