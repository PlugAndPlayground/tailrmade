import React, { useRef, useState } from 'react';
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
import { createStyles, makeStyles } from '@mui/styles';

export type SubMenuItemProps = MenuItemProps & {
  button?: true;
  label: string;
} & Pick<PopperProps, 'placement'>;

const useStyles = makeStyles((theme) =>
  createStyles({
    active: {
      backgroundColor: 'rgba(255, 255, 255, 0.04)',
    },
  }),
);

export const SubMenuItem = (props: SubMenuItemProps) => {
  // @ts-ignore
  const classes = useStyles();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement | null>(null);

  return (
    <MenuItem
      {...props}
      ref={ref}
      className={open ? classes.active : ''}
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
