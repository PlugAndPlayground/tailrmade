import React, { useId } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import { styled } from '@mui/material/styles';
import ArrowDropUpIcon from '@mui/icons-material/ArrowDropUp';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import type { SxProps, Theme } from '@mui/material/styles';
import Box from '@mui/material/Box';

/**
 * Number input composed from Base UI's `NumberField`, styled to match the
 * `variant="filled"` MUI TextField look used across the widgets.
 *
 * Replaces the previous `TextField` + `inputProps={{ type: 'number' }}`
 * workaround: it keeps values numeric (no string round-tripping), clamps to
 * min/max, and does not hijack the scroll wheel (`allowWheelScrub` is off by
 * default in Base UI).
 */
export interface NumberInputProps {
  /** Floating label shown at the top. Omit for a compact, label-less field. */
  label?: string;
  value: number | null;
  onChange?: (value: number | null) => void;
  min?: number;
  max?: number;
  /** Step for the +/- buttons and arrow keys. `'any'` disables step snapping. */
  step?: number | 'any';
  disabled?: boolean;
  readOnly?: boolean;
  size?: 'small' | 'medium';
  /** Hide the +/- stepper buttons (e.g. in tight rows next to a slider). */
  hideSteppers?: boolean;
  /** Trailing content, e.g. a unit like "ms". */
  endAdornment?: React.ReactNode;
  dataCy?: string;
  sx?: SxProps<Theme>;
  /** Extra styles applied to the native input (alignment, font size, ...). */
  inputSx?: SxProps<Theme>;
}

const filledBg = (theme: Theme) =>
  theme.palette.mode === 'dark'
    ? 'rgba(255, 255, 255, 0.09)'
    : 'rgba(0, 0, 0, 0.06)';

const Group = styled(NumberField.Group)(({ theme }) => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'stretch',
  width: '100%',
  minWidth: 0,
  borderTopLeftRadius: theme.shape.borderRadius,
  borderTopRightRadius: theme.shape.borderRadius,
  backgroundColor: filledBg(theme),
  borderBottom: `1px solid ${theme.palette.text.secondary}`,
  transition: theme.transitions.create(['border-color', 'background-color']),
  '&:hover': {
    backgroundColor:
      theme.palette.mode === 'dark'
        ? 'rgba(255, 255, 255, 0.13)'
        : 'rgba(0, 0, 0, 0.09)',
  },
  '&:focus-within': {
    borderBottomWidth: 2,
    borderBottomColor: theme.palette.primary.main,
  },
  '&[data-disabled]': {
    opacity: 0.5,
    pointerEvents: 'none',
  },
}));

const Label = styled('label')(({ theme }) => ({
  position: 'absolute',
  top: 6,
  left: 12,
  fontSize: '12px',
  lineHeight: 1,
  color: theme.palette.text.secondary,
  pointerEvents: 'none',
  'div:focus-within > &': {
    color: theme.palette.primary.main,
  },
}));

const Input = styled(NumberField.Input)(({ theme }) => ({
  flex: 1,
  width: '100%',
  minWidth: 0,
  border: 0,
  outline: 0,
  background: 'transparent',
  color: theme.palette.text.primary,
  fontFamily: theme.typography.fontFamily,
  // Hide the native spinners – the buttons below replace them.
  '&::-webkit-outer-spin-button, &::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
  MozAppearance: 'textfield',
}));

const EndAdornment = styled('div')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  paddingRight: 12,
  color: theme.palette.text.secondary,
  fontSize: '14px',
  whiteSpace: 'nowrap',
}));

const Stepper = styled('div')({
  display: 'flex',
  flexDirection: 'column',
  paddingRight: 2,
});

const StepButton = styled('button')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  flex: 1,
  padding: 0,
  border: 0,
  cursor: 'pointer',
  background: 'transparent',
  color: theme.palette.text.secondary,
  lineHeight: 0,
  '&:hover': { color: theme.palette.text.primary },
  '& svg': { fontSize: 18 },
}));

export const NumberInput: React.FC<NumberInputProps> = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  disabled,
  readOnly,
  size = 'medium',
  hideSteppers,
  endAdornment,
  dataCy,
  sx,
  inputSx,
}) => {
  const id = useId();
  const hasLabel = Boolean(label);
  const small = size === 'small';

  const inputBaseSx: SxProps<Theme> = {
    fontSize: small ? '14px' : '16px',
    // The input inherits a collapsed line-height from ancestors; reset it so the
    // text is sized/centered correctly instead of shrinking the field.
    lineHeight: 'normal',
    padding: hasLabel
      ? small
        ? '20px 8px 5px'
        : '24px 12px 7px'
      : small
        ? '7px 8px'
        : '15px 12px',
    // Label-less fields have no floating label to give them height, so pin an
    // explicit box height (box-sizing is border-box here, so this is the total).
    ...(hasLabel ? {} : { height: small ? '32px' : '40px' }),
  };

  return (
    <Box sx={[{ minWidth: 0 }, ...(Array.isArray(sx) ? sx : [sx])]}>
      <NumberField.Root
        id={id}
        value={value}
        onValueChange={onChange}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        readOnly={readOnly}
      >
        <Group>
          {hasLabel && <Label htmlFor={id}>{label}</Label>}
          <Input
            data-cy={dataCy}
            aria-label={label}
            sx={[inputBaseSx, ...(Array.isArray(inputSx) ? inputSx : [inputSx])]}
          />
          {endAdornment && <EndAdornment>{endAdornment}</EndAdornment>}
          {!hideSteppers && !readOnly && (
            <Stepper>
              <NumberField.Increment render={<StepButton />} aria-label="Increase">
                <ArrowDropUpIcon />
              </NumberField.Increment>
              <NumberField.Decrement render={<StepButton />} aria-label="Decrease">
                <ArrowDropDownIcon />
              </NumberField.Decrement>
            </Stepper>
          )}
        </Group>
      </NumberField.Root>
    </Box>
  );
};
