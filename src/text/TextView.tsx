import React, { useMemo } from 'react';
import { Box, Link } from '@mui/material';
import type { Theme } from '@mui/material';
import { markdownToTextContent } from './lexical/markdown';
import {
  normalizeTextProps,
  resolveTextElementStyle,
  TEXT_TONES,
  TextMarks,
  TONE_PALETTE,
  toneCssVariable,
} from './model';
import { renderTokenSource } from './tokens';

const paletteColor = (theme: Theme, path: string): string =>
  path.split('.').reduce((value: any, key) => value[key], theme.palette);

/** The tone colors of the app theme, as the variables editor runs use. */
export const toneCssVariables = (theme: Theme): Record<string, string> =>
  Object.fromEntries(
    TEXT_TONES.map((tone) => [
      toneCssVariable(tone),
      paletteColor(theme, TONE_PALETTE[tone]),
    ]),
  );

const Run: React.FC<{ marks?: TextMarks; children: React.ReactNode }> = ({
  marks = {},
  children,
}) => {
  let run = <>{children}</>;
  if (marks.code) {
    run = (
      <Box
        component="code"
        sx={{
          fontFamily: 'monospace',
          bgcolor: 'action.hover',
          px: 0.25,
          borderRadius: 0.5,
        }}
      >
        {run}
      </Box>
    );
  }
  if (marks.emphasis) run = <em>{run}</em>;
  if (marks.strong) run = <strong>{run}</strong>;
  if (marks.tone || marks.nowrap) {
    run = (
      <Box
        component="span"
        sx={{
          color: marks.tone ? TONE_PALETTE[marks.tone] : undefined,
          whiteSpace: marks.nowrap ? 'nowrap' : undefined,
        }}
      >
        {run}
      </Box>
    );
  }
  if (marks.link) {
    run = (
      <Link
        href={marks.link}
        target="_blank"
        rel="noopener noreferrer"
        color={marks.tone ? 'inherit' : undefined}
      >
        {run}
      </Link>
    );
  }
  return run;
};

export type TextViewProps = Record<string, unknown> & {
  // the owning node's bindable inputs; undefined for static text, which shows
  // token sources as the literal text they are
  inputs?: Record<string, unknown>;
  dataCy?: string;
  id?: string;
};

/** Read-only text: the running app and every surface preview. */
export const TextView: React.FC<TextViewProps> = ({
  inputs,
  dataCy,
  id,
  ...props
}) => {
  const textProps = normalizeTextProps(props);
  const hasTokens = inputs !== undefined;
  const content = useMemo(
    () => markdownToTextContent(textProps.content, hasTokens),
    [textProps.content, hasTokens],
  );
  return (
    <Box
      id={id}
      data-cy={dataCy}
      sx={{
        width: '100%',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        ...resolveTextElementStyle(textProps),
      }}
    >
      {content.paragraphs.map((paragraph, index) => (
        <div key={index}>
          {paragraph.runs.length === 0 ? (
            <br />
          ) : (
            paragraph.runs.map((run, runIndex) =>
              run.type === 'break' ? (
                <br key={runIndex} />
              ) : (
                <Run key={runIndex} marks={run.marks}>
                  {run.type === 'text'
                    ? run.text
                    : renderTokenSource(run.source, inputs!)}
                </Run>
              ),
            )
          )}
        </div>
      ))}
    </Box>
  );
};
