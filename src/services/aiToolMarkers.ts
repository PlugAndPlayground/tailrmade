/**
 * Markers the agent run injects into an assistant message to report what it
 * did (see AIBackend). They serve two readers that must not drift apart:
 *
 * - the assistant panel turns them into action chips
 * - the model must never see them at all
 *
 * That second point is the important one. A stored assistant message is
 * replayed to the model as plain text on the next request, so a transcript
 * full of "*Used set_socket_value.*" lines is the only account of tool use the
 * model gets - and it reads as a demonstration that tool calls are written out
 * in prose. Models follow that demonstration: they stop emitting tool calls
 * and start describing them, which looks to the user like the tools broke.
 */

export const usingToolMarker = (toolName: string): string =>
  `*Using ${toolName}...*`;

export const usedToolMarker = (toolName: string): string =>
  `*Used ${toolName}.*`;

/**
 * The detail is an arbitrary tool result, and a "*" anywhere inside it closes
 * the marker early - the tail then leaks into the panel as literal text and
 * into the transcript the model replays. Asterisks carry no meaning here.
 */
export const toolFailedMarker = (toolName: string, detail: string): string =>
  `*${toolName} failed: ${String(detail ?? '').replace(/\*/g, '')}*`;

export const checkingWarningsMarker = (): string =>
  '*Checking graph warnings and errors before finishing...*';

export const lookedAtUIMarker = (): string => '*Looked at the rendered UI.*';

export const completedToolCallsMarker = (
  toolCallCount: number,
  inspectionSummary: string,
): string =>
  `*Completed ${toolCallCount} MCP tool call(s).` +
  (inspectionSummary ? ` Inspections: ${inspectionSummary}.` : '') +
  '*';

export const turnLimitMarker = (maxAgentTurns: number): string =>
  `Stopped after reaching the MCP turn limit (${maxAgentTurns}) for this request.`;

export const runStoppedEarlyMarker = (stopReason: string): string =>
  `*Run stopped early: the model's reply was cut off (${stopReason}).*`;

const toolNamePattern = '[A-Za-z0-9_.:-]+';

/**
 * One alternative per marker, each owning at least one named group so a caller
 * can tell which one matched. Order matters: alternatives are tried left to
 * right at each position.
 */
const markerPatterns = [
  String.raw`\*Using\s+(?<usingTool>${toolNamePattern})\.\.\.\*`,
  String.raw`\*Used\s+(?<usedTool>${toolNamePattern})\.\*`,
  String.raw`\*(?<failedTool>${toolNamePattern})\s+failed:\s+(?<failedDetail>[\s\S]*?)\*`,
  String.raw`\*(?<checkingWarnings>Checking graph warnings and errors before finishing\.\.\.)\*`,
  String.raw`\*(?<stoppedEarly>Run stopped early:[^*]*)\*`,
  // The inspection tail is optional and free-form, so it has to be consumed
  // here too - without it the closing "*" never lines up and the whole marker
  // leaks into the panel as literal text.
  String.raw`\*Completed\s+(?<completedCount>\d+)\s+MCP tool call\(s\)\.(?<completedInspections>[^*]*)\*`,
  String.raw`\*(?<lookedAtUI>Looked at the rendered UI\.)\*`,
  String.raw`Stopped after reaching the MCP turn limit \((?<limitTurns>\d+)\) for this request\.`,
];

/** Named groups a match can carry, one set per marker. */
export interface ToolMarkerGroups {
  usingTool?: string;
  usedTool?: string;
  failedTool?: string;
  failedDetail?: string;
  checkingWarnings?: string;
  stoppedEarly?: string;
  completedCount?: string;
  completedInspections?: string;
  lookedAtUI?: string;
  limitTurns?: string;
}

// A fresh regex per caller: a shared /g regex carries lastIndex between scans.
export const createToolMarkerRegex = (): RegExp =>
  new RegExp(markerPatterns.join('|'), 'g');

/**
 * Removes every marker from an assistant message so a model is replayed only
 * what it actually wrote, and collapses the blank lines the removals leave.
 */
export function stripAIToolMarkers(content: string): string {
  return content
    .replace(createToolMarkerRegex(), '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
