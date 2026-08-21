import { Button, styled } from '@mui/material';

// The shell's square icon button (rail, panels, dashboard chrome). It lives
// in its own module because both the shell layout and the layoutable helpers
// use it - importing it from GraphOverlay would make that cycle back on the
// shell it renders.
export const StyledButton = styled(Button, {
  shouldForwardProp: (prop) => !['isSelected'].includes(prop as string),
})<{ isSelected?: boolean }>(({ theme, isSelected }) => ({
  minWidth: 0,
  padding: theme.spacing(0.5),
  backgroundColor: isSelected
    ? theme.palette.primary.main
    : theme.palette.common.white,
  borderRadius: theme.shape.borderRadius,
  '&:hover': {
    backgroundColor: isSelected
      ? theme.palette.primary.dark
      : theme.palette.grey[200],
  },
  width: 32,
  height: 32,
  '& .MuiSvgIcon-root': {
    color: isSelected ? theme.palette.common.white : 'inherit',
  },
  '--svg-fill-color': isSelected
    ? theme.palette.common.white
    : theme.palette.primary.main,
}));
