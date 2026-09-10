const toolNamePattern = '[A-Za-z0-9_.:-]+';

// Shared by the conversation UI parser and the model-history filter.
const markerPatterns = [
  String.raw`\*(?:Using\s+(${toolNamePattern})\.\.\.`,
  String.raw`Used\s+(${toolNamePattern})\.`,
  String.raw`(${toolNamePattern})\s+failed:\s+([^*]*)`,
  String.raw`Checking graph warnings and errors before finishing\.\.\.`,
  String.raw`Completed\s+(\d+)\s+MCP tool call\(s\)\.(?:\s+Inspections:[^*]*)?`,
  String.raw`(Looked at the rendered UI\.))\*`,
  String.raw`Stopped after reaching the MCP turn limit \((\d+)\) for this request\.`,
];

export const createToolMarkerRegex = (): RegExp =>
  new RegExp(markerPatterns.join('|'), 'g');

export function stripAIToolMarkers(content: string): string {
  return content
    .replace(createToolMarkerRegex(), '')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
