import React from 'react';
import { Chip, ChipProps } from '@mui/material';
import { TRgba } from '../utils/color';

export type TagChipProps = Omit<ChipProps, 'onClick' | 'color'> & {
  label: string;
  color?: string;
  selected?: boolean;
  onClick?: (event: React.SyntheticEvent, label: string) => void;
};

export const TagChip: React.FC<TagChipProps> = ({
  label,
  color,
  selected = false,
  onClick,
  sx,
  ...restOfProps
}) => {
  return (
    <Chip
      {...restOfProps}
      label={label}
      size="small"
      color={selected && !color ? 'primary' : 'default'}
      onMouseDown={(event) => event.preventDefault()}
      onClick={
        onClick &&
        ((event: React.MouseEvent) => {
          event.stopPropagation();
          event.preventDefault();
          onClick(event, label);
        })
      }
      sx={[
        {
          fontSize: '10px',
          cursor: onClick ? 'pointer' : 'default',
          // on the chip itself this shrinks the centred content box and
          // lifts the delete icon off centre
          '& .MuiChip-label': {
            paddingBottom: '2px',
          },
        },
        !!color && {
          bgcolor: color,
          color: TRgba.fromString(color).getContrastTextColor().hex(),
          outline: selected ? '1px solid rgba(255,255,255,0.9)' : 'none',
          '& .MuiChip-deleteIcon': {
            color: TRgba.fromString(color).getContrastTextColor().hex(),
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
