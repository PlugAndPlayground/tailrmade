import { Theme } from '@mui/material';

// The theme as CSS custom properties, for authored HTML. The Tailwind color
// names that read these are declared once in template.html (`@theme inline`),
// so markup can use `bg-primary`, `text-foreground`, ... and follow whichever
// theme the element sits under.
//
// Read from the MUI theme rather than the token record so the derived values
// (contrastText, the full font stack) match what MUI widgets render.
export const themeToCssVariables = (theme: Theme): Record<string, string> => {
  const { palette, typography, shape } = theme;
  return {
    '--tm-primary': palette.primary.main,
    '--tm-primary-foreground': palette.primary.contrastText,
    '--tm-secondary': palette.secondary.main,
    '--tm-secondary-foreground': palette.secondary.contrastText,
    '--tm-background': palette.background.default,
    '--tm-paper': palette.background.paper,
    '--tm-foreground': palette.text.primary,
    '--tm-muted-foreground': palette.text.secondary,
    '--tm-divider': palette.divider,
    '--tm-error': palette.error.main,
    '--tm-warning': palette.warning.main,
    '--tm-info': palette.info.main,
    '--tm-success': palette.success.main,
    '--tm-radius': `${shape.borderRadius}px`,
    '--tm-font-family': typography.fontFamily as string,
  };
};
