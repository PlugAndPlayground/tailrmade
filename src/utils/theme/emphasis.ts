import type { Theme } from '@mui/material';

// How much a container stands out from what it sits on, and in which theme
// color. Levels and roles, not colors: every value below is derived from theme
// roles that each preset authors for both modes, so an emphasized container
// survives the light/dark switch and a preset switch without the creator
// touching it.
export type ContainerEmphasis = 'none' | 'subtle' | 'strong';

export const CONTAINER_EMPHASES: readonly ContainerEmphasis[] = [
  'none',
  'subtle',
  'strong',
];

export const DEFAULT_CONTAINER_EMPHASIS: ContainerEmphasis = 'none';

export const isContainerEmphasis = (
  value: unknown,
): value is ContainerEmphasis =>
  CONTAINER_EMPHASES.includes(value as ContainerEmphasis);

// A separate axis from emphasis, so more roles (success, warning, ...) can be
// added without a stored value changing meaning.
export type ContainerTone = 'neutral' | 'primary' | 'secondary';

export const CONTAINER_TONES: readonly ContainerTone[] = [
  'neutral',
  'primary',
  'secondary',
];

export const DEFAULT_CONTAINER_TONE: ContainerTone = 'neutral';

export const isContainerTone = (value: unknown): value is ContainerTone =>
  CONTAINER_TONES.includes(value as ContainerTone);

// Neutral tints with the theme's own text color - dark on a light app, light
// on a dark one, so it flips with the mode on its own. A colored tone needs a
// little more to read as that color.
const SUBTLE_TINT_PERCENT = {
  neutral: { light: 4, dark: 6 },
  toned: { light: 8, dark: 12 },
} as const;
// A toned card is a translucent tint over whatever is behind it, never a mix
// into paper: a paper with a hue of its own (tailrmade's navy) swallows the
// tone and leaves a muddy in-between.
// Strong is a clear step up from subtle's toned tint, so the fill carries the
// card and its border can stay quiet.
const STRONG_TINT_PERCENT = { light: 16, dark: 22 } as const;
const STRONG_BORDER_PERCENT = 50;

const tint = (color: string, percent: number): string =>
  `color-mix(in srgb, ${color} ${percent}%, transparent)`;

const toneColor = (theme: Theme, tone: unknown): string | undefined =>
  tone === 'primary' || tone === 'secondary'
    ? theme.palette[tone].main
    : undefined;

// The fill is only ever a tint, so text keeps the theme's text color and a
// primary button inside a primary card still stands out.
export const containerEmphasisSx = (
  emphasis: unknown,
  tone: unknown,
  ownBackground: boolean,
): Record<string, unknown> => {
  if (emphasis === 'subtle') {
    return {
      borderRadius: (theme: Theme) => `${theme.shape.borderRadius}px`,
      ...(!ownBackground && {
        backgroundColor: (theme: Theme) => {
          const color = toneColor(theme, tone);
          const percent =
            SUBTLE_TINT_PERCENT[color ? 'toned' : 'neutral'][
              theme.palette.mode
            ];
          return tint(color ?? theme.palette.text.primary, percent);
        },
      }),
    };
  }
  if (emphasis === 'strong') {
    return {
      borderRadius: (theme: Theme) => `${theme.shape.borderRadius}px`,
      border: (theme: Theme) => {
        const color = toneColor(theme, tone);
        return `1px solid ${
          color ? tint(color, STRONG_BORDER_PERCENT) : theme.palette.divider
        }`;
      },
      boxShadow: (theme: Theme) => theme.shadows[2],
      ...(!ownBackground && {
        backgroundColor: (theme: Theme) => {
          const color = toneColor(theme, tone);
          return color
            ? tint(color, STRONG_TINT_PERCENT[theme.palette.mode])
            : theme.palette.background.paper;
        },
      }),
    };
  }
  return {};
};
