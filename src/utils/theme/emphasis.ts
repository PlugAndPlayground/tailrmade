import type { Theme } from '@mui/material';

// How much a container stands out from what it sits on. A LEVEL, not a color:
// every value below is derived from theme roles that each preset authors for
// both modes, so an emphasized container survives the light/dark switch and a
// preset switch without the creator touching it.
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

// The subtle tint is the theme's own text color at a whisper - dark on a light
// app, light on a dark one, so it flips with the mode on its own.
const SUBTLE_TINT_PERCENT = { light: 4, dark: 6 } as const;

export const containerEmphasisSx = (
  emphasis: unknown,
  ownBackground: boolean,
): Record<string, unknown> => {
  if (emphasis === 'subtle') {
    return {
      borderRadius: (theme: Theme) => `${theme.shape.borderRadius}px`,
      ...(!ownBackground && {
        backgroundColor: (theme: Theme) =>
          `color-mix(in srgb, ${theme.palette.text.primary} ${
            SUBTLE_TINT_PERCENT[theme.palette.mode]
          }%, transparent)`,
      }),
    };
  }
  if (emphasis === 'strong') {
    return {
      borderRadius: (theme: Theme) => `${theme.shape.borderRadius}px`,
      border: (theme: Theme) => `1px solid ${theme.palette.divider}`,
      boxShadow: (theme: Theme) => theme.shadows[2],
      ...(!ownBackground && { backgroundColor: 'background.paper' }),
    };
  }
  return {};
};
