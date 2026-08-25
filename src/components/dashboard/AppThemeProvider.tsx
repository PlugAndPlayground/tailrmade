import React, { useMemo } from 'react';
import { ThemeProvider } from '@mui/material';
import { createAppTheme } from '../../utils/theme/muiTheme';
import { useResolvedAppTheme } from '../../utils/theme/store';

/**
 * The boundary between the editor's theme and the app's.
 *
 * Everything inside renders under the theme the CREATOR authored; everything
 * outside stays on the editor theme. The reset is hard in both directions -
 * MUI's ThemeProvider replaces the theme outright when handed an object rather
 * than a function, which is what we want: editing in a dark editor while the
 * app's theme is light must render the app light. If this boundary were soft,
 * the editor preview would diverge from the published output in ways that are
 * very hard to trace later.
 *
 * Wrap app CONTENT with this, never editor chrome. The toolbox, the layers
 * panel, the surface header and the inspectors are the editor's, and belong
 * outside.
 */
export const AppThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const resolved = useResolvedAppTheme();
  // createAppTheme is memoized on the resolved token hash, so this only
  // produces a new object when a token actually changed - but useMemo keeps
  // even the cache lookup off the render path
  const theme = useMemo(() => createAppTheme(resolved), [resolved.hash]);

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
};
