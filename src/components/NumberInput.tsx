import React, { useEffect, useId, useState } from 'react';
import { NumberField } from '@base-ui/react/number-field';
import {
  FilledInput,
  FormControl,
  FormControlProps,
  FormHelperText,
  IconButton,
  Input,
  InputAdornment,
  InputLabel,
  OutlinedInput,
} from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import type { InputVariant } from '../utils/theme/tokens';

/**
 * Number input composed from Base UI's `NumberField`, which parses, clamps and
 * steps the value, rendered with MUI's own input parts.
 */
export interface NumberInputProps {
  label?: string;
  value: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  /** Step for the arrows and arrow keys. `'any'` disables step snapping. */
  step?: number | 'any';
  /** Rounds to this many fraction digits; omit to keep every digit. */
  decimals?: number;
  disabled?: boolean;
  readOnly?: boolean;
  required?: boolean;
  size?: 'small' | 'medium';
  variant?: InputVariant;
  color?: FormControlProps['color'];
  placeholder?: string;
  helperText?: string;
  hideSteppers?: boolean;
  /** Trailing content, e.g. a unit like "ms". */
  endAdornment?: React.ReactNode;
  dataCy?: string;
  sx?: SxProps<Theme>;
}

const inputComponents = {
  filled: FilledInput,
  outlined: OutlinedInput,
  standard: Input,
};

// FormControl reads the value off an 'Input' child on its first render, so the
// label starts shrunk instead of animating in on mount
function InitialFilledMarker(_: { value: number | null }) {
  return null;
}
InitialFilledMarker.muiName = 'Input';

export const NumberInput = ({
  label,
  value,
  onChange,
  min,
  max,
  step,
  decimals,
  disabled,
  readOnly,
  required,
  size = 'medium',
  variant = 'filled',
  color,
  placeholder,
  helperText,
  hideSteppers,
  endAdornment,
  dataCy,
  sx,
  ...rest
}: NumberInputProps) => {
  const id = useId();
  // null while the field holds no complete number (empty, or a lone '-'): that
  // never reaches onChange, and leaving the field brings the last value back
  const [typed, setTyped] = useState<number | null>(value);
  useEffect(() => setTyped(value), [value]);

  const InputComponent = inputComponents[variant] as typeof OutlinedInput;
  const showSteppers = !hideSteppers && !readOnly;

  return (
    <NumberField.Root
      value={typed}
      onValueChange={(next) => {
        setTyped(next);
        if (next !== null) {
          onChange?.(next);
        }
      }}
      onValueCommitted={(next) => {
        if (next === null) {
          setTyped(value);
        }
      }}
      min={min}
      max={max}
      step={step}
      format={
        decimals === undefined ? undefined : { maximumFractionDigits: decimals }
      }
      disabled={disabled}
      readOnly={readOnly}
      required={required}
      render={(rootProps, state) => (
        <FormControl
          {...rest}
          ref={rootProps.ref}
          fullWidth
          margin="none"
          variant={variant}
          color={color}
          size={size}
          disabled={state.disabled}
          required={state.required}
          sx={sx}
        >
          {rootProps.children}
        </FormControl>
      )}
    >
      <InitialFilledMarker value={typed} />
      {label && <InputLabel htmlFor={id}>{label}</InputLabel>}
      <NumberField.Input
        id={id}
        data-cy={dataCy}
        placeholder={placeholder}
        aria-describedby={helperText ? `${id}-helper-text` : undefined}
        render={(inputProps, state) => (
          <InputComponent
            {...(variant === 'outlined' && { label })}
            {...(variant === 'filled' && { hiddenLabel: !label })}
            inputRef={inputProps.ref}
            value={state.inputValue}
            onChange={inputProps.onChange}
            onKeyUp={inputProps.onKeyUp}
            onKeyDown={inputProps.onKeyDown}
            onFocus={inputProps.onFocus}
            onBlur={inputProps.onBlur}
            slotProps={{ input: inputProps }}
            endAdornment={
              endAdornment || showSteppers ? (
                <>
                  {endAdornment && (
                    <InputAdornment position="end">
                      {endAdornment}
                    </InputAdornment>
                  )}
                  {showSteppers && (
                    <InputAdornment
                      position="end"
                      sx={{
                        flexDirection: 'column',
                        alignSelf: 'stretch',
                        height: 'auto',
                        maxHeight: 'unset',
                        '& .MuiIconButton-root': {
                          p: 0,
                          flex: 1,
                          borderRadius: 0.5,
                        },
                      }}
                    >
                      <NumberField.Increment
                        render={
                          <IconButton
                            size={size}
                            sx={{ alignItems: 'flex-end' }}
                          />
                        }
                        aria-label="Increase"
                      >
                        <KeyboardArrowUpIcon />
                      </NumberField.Increment>
                      <NumberField.Decrement
                        render={
                          <IconButton
                            size={size}
                            sx={{ alignItems: 'flex-start' }}
                          />
                        }
                        aria-label="Decrease"
                      >
                        <KeyboardArrowDownIcon />
                      </NumberField.Decrement>
                    </InputAdornment>
                  )}
                </>
              ) : undefined
            }
            sx={{ pr: 0.5 }}
          />
        )}
      />
      {helperText && (
        <FormHelperText id={`${id}-helper-text`}>{helperText}</FormHelperText>
      )}
    </NumberField.Root>
  );
};

/**
 * The inspector's number input. It follows the editor, never the app theme:
 * always filled, with fixed type sizes and the inspector's tighter padding.
 */
export const InspectorNumberInput = ({
  size = 'medium',
  sx,
  ...props
}: Omit<NumberInputProps, 'variant'>) => {
  const small = size === 'small';
  const hasLabel = Boolean(props.label);

  return (
    <NumberInput
      {...props}
      size={size}
      variant="filled"
      sx={[
        (theme: Theme) => ({
          '& .MuiInputBase-input': {
            fontSize: small ? '14px' : '16px',
            lineHeight: 'normal',
            boxSizing: 'border-box',
            height: hasLabel ? 'auto' : small ? '32px' : '40px',
            padding: hasLabel
              ? small
                ? '20px 8px 5px'
                : '24px 12px 7px'
              : small
                ? '7px 8px'
                : '15px 12px',
          },
          '& .MuiInputAdornment-root .MuiSvgIcon-root': { fontSize: '18px' },
          '& .MuiInputAdornment-root .MuiTypography-root': { fontSize: '14px' },
          // dimmed like the rest of the inspector instead of MUI's greyed-out look
          '& .MuiFilledInput-root.Mui-disabled': {
            opacity: 0.5,
            backgroundColor:
              theme.palette.mode === 'dark'
                ? 'rgba(255, 255, 255, 0.09)'
                : 'rgba(0, 0, 0, 0.06)',
            '&:before': { borderBottomStyle: 'solid' },
          },
          '& .MuiInputBase-input.Mui-disabled': {
            WebkitTextFillColor: theme.palette.text.primary,
          },
        }),
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  );
};
