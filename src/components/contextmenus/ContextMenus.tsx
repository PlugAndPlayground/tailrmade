import React, { useLayoutEffect, useRef, useState } from 'react';
import {
  ListItemText,
  MenuItem,
  MenuItemProps,
  MenuList,
  Paper,
  Popper,
  PopperProps,
  Typography,
} from '@mui/material';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';

const WINDOW_MARGIN = 8;

// A menu's height depends on its items, so it can only be fitted once rendered.
// A menu taller than the window stays at the top and scrolls.
export const useFitInWindow = (top: number) => {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = ref.current!;
    const lowestTop = window.innerHeight - menu.offsetHeight - WINDOW_MARGIN;
    menu.style.top = `${Math.max(0, Math.min(top, lowestTop))}px`;
  });
  return ref;
};

export type SubMenuItemProps = MenuItemProps & {
  button?: true;
  label: string;
} & Pick<PopperProps, 'placement'>;

export const SubMenuItem = (props: SubMenuItemProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);

  return (
    <MenuItem
      {...props}
      ref={ref}
      sx={open ? { backgroundColor: 'rgba(255, 255, 255, 0.04)' } : undefined}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <ListItemText sx={{ ml: 4.5 }}>{props.label}</ListItemText>
      <Typography variant="body2" color="text.secondary">
        <ChevronRightIcon fontSize="medium" />
      </Typography>
      <Popper
        anchorEl={ref.current}
        open={open}
        placement={props.placement ?? 'right'}
        sx={{ zIndex: 1600 }}
        modifiers={[
          {
            name: 'flip',
            enabled: true,
          },
          {
            name: 'preventOverflow',
            enabled: true,
            options: {
              boundariesElement: 'viewport',
            },
          },
        ]}
      >
        <Paper
          elevation={3}
          sx={{
            minWidth: 240,
            maxWidth: '100%',
          }}
        >
          <MenuList dense>{props.children}</MenuList>
        </Paper>
      </Popper>
    </MenuItem>
  );
};
