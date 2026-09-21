import React from 'react';
import { MenuItem, Select, Stack, ToggleButton } from '@mui/material';
import {
  AlignmentControl,
  CustomCSSSection,
  FormWrapper,
  StyledFormLabel,
} from '../components/dashboard/SettingsControls';
import {
  TEXT_ALIGNMENTS,
  TEXT_TONES,
  TEXT_VARIANTS,
  TextAlignment,
  TextProps,
  TextTone,
  TextVariant,
} from './model';

export type TextStyleSettingsProps = {
  props: TextProps;
  update: (mutate: (props: TextProps) => void) => void;
  children?: React.ReactNode;
};

type OptionSelectProps<T extends string> = {
  label: string;
  name: string;
  value: T;
  options: readonly T[];
  onChange: (value: T) => void;
};

const OptionSelect = <T extends string>({
  label,
  name,
  value,
  options,
  onChange,
}: OptionSelectProps<T>) => (
  <FormWrapper>
    <StyledFormLabel>{label}</StyledFormLabel>
    <Select
      fullWidth
      variant="filled"
      value={value}
      data-cy={`text-${name}-select`}
      MenuProps={{ style: { zIndex: 1500 } }}
      sx={{ height: '32px', fontSize: '16px', lineHeight: '8px' }}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <MenuItem
          key={option}
          value={option}
          data-cy={`text-${name}-${option}`}
        >
          {option}
        </MenuItem>
      ))}
    </Select>
  </FormWrapper>
);

/** Inspector for the style of static Text. */
export const TextStyleSettings: React.FC<TextStyleSettingsProps> = ({
  props,
  update,
  children,
}) => (
  <Stack
    spacing={0.5}
    sx={{ bgcolor: 'background.paper' }}
    data-cy="text-settings"
  >
    <OptionSelect<TextVariant>
      label="Variant"
      name="variant"
      value={props.variant}
      options={TEXT_VARIANTS}
      onChange={(value) =>
        update((draft) => {
          draft.variant = value;
        })
      }
    />
    <OptionSelect<TextTone>
      label="Tone"
      name="tone"
      value={props.tone}
      options={TEXT_TONES}
      onChange={(value) =>
        update((draft) => {
          draft.tone = value;
        })
      }
    />
    <AlignmentControl
      value={props.alignment}
      label="Alignment"
      onChange={(value) =>
        update((draft) => {
          draft.alignment = value as TextAlignment;
        })
      }
      options={TEXT_ALIGNMENTS.map((alignment) => (
        <ToggleButton size="small" value={alignment} key={alignment}>
          {alignment}
        </ToggleButton>
      ))}
    />
    <CustomCSSSection props={props} setProp={update} />
    {children}
  </Stack>
);
