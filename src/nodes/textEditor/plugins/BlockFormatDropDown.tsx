import * as React from 'react';
import { useEffect, useRef } from 'react';
import {
  Button,
  ClickAwayListener,
  MenuItem,
  MenuList,
  ListItemIcon,
  ListItemText,
  Paper,
  Popper,
  Typography,
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import { BlockTypeMap } from './ToolbarPlugin';

export function BlockFormatDropDown({
  blockType,
  toolbarRef,
  blockTypeToBlockName,
  showBlockTypeDropDown,
  setShowBlockTypeDropDown,
}: {
  blockType: keyof typeof blockTypeToBlockName;
  toolbarRef;
  blockTypeToBlockName: BlockTypeMap;
  showBlockTypeDropDown;
  setShowBlockTypeDropDown;
}): JSX.Element {
  const dropDownRef = useRef(null);
  const blockTypeDropDownanchorRef = useRef<HTMLButtonElement>(null);

  const handleBlockTypeDropdownToggle = (event) => {
    event.stopPropagation(); // for ClickAwayListener to work
    setShowBlockTypeDropDown((prev) => !prev);
  };

  useEffect(() => {
    const toolbar = toolbarRef.current;
    const dropDown = dropDownRef.current;

    if (toolbar !== null && dropDown !== null) {
      const { top, left } = toolbar.getBoundingClientRect();
      dropDown.style.top = `${top + 40}px`;
      dropDown.style.left = `${left}px`;
    }
  }, [dropDownRef, toolbarRef]);

  useEffect(() => {
    const dropDown = dropDownRef.current;
    const toolbar = toolbarRef.current;

    if (dropDown !== null && toolbar !== null) {
      const handle = (event) => {
        const target = event.target;

        if (!dropDown.contains(target) && !toolbar.contains(target)) {
          setShowBlockTypeDropDown(false);
        }
      };
      document.addEventListener('click', handle);

      return () => {
        document.removeEventListener('click', handle);
      };
    }
  }, [dropDownRef, setShowBlockTypeDropDown, toolbarRef]);

  return (
    <>
      <Button
        ref={blockTypeDropDownanchorRef}
        sx={{
          color: 'inherit',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0 0 0 8px',
          '&.Mui-selected': {
            color: 'inherit',
          },
        }}
        onClick={handleBlockTypeDropdownToggle}
        aria-label="Formatting Options"
      >
        {React.createElement(blockTypeToBlockName[blockType].icon)}
        <ExpandMore />
      </Button>
      <ClickAwayListener onClickAway={handleBlockTypeDropdownToggle}>
        <Popper
          sx={{
            zIndex: 10,
          }}
          open={showBlockTypeDropDown}
          anchorEl={blockTypeDropDownanchorRef.current}
          placement="bottom-start"
        >
          <Paper>
            <MenuList autoFocusItem>
              {Object.entries(blockTypeToBlockName).map(
                ([type, { name, icon: Icon, action, shortcut }]) => (
                  <MenuItem
                    key={type}
                    onClick={action}
                    selected={blockType === type}
                  >
                    <ListItemIcon>
                      <Icon />
                    </ListItemIcon>
                    <ListItemText primary={name} />
                    <Typography
                      variant="body2"
                      color="text.secondary"
                      sx={{
                        pl: 1,
                      }}
                    >
                      {shortcut}
                    </Typography>
                  </MenuItem>
                ),
              )}
            </MenuList>
          </Paper>
        </Popper>
      </ClickAwayListener>
    </>
  );
}
