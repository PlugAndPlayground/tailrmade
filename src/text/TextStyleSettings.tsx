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

/** Inspector for the style of static Text. */
export const TextStyleSettings: React.FC<TextStyleSettingsProps> = ({
  props,
  update,
  children,
}) => (
  <Stack spacing={0.5} sx={{ bgcolor: 'background.paper' }} data-cy="text-settings">
    <FormWrapper>
      <StyledFormLabel>Variant</StyledFormLabel>
      <Select
        fullWidth
        variant="filled"
        value={props.variant}
        data-cy="text-variant-select"
        MenuProps={{ style: { zIndex: 1500 } }}
        sx={{ height: '32px', fontSize: '16px', lineHeight: '8px' }}
        onChange={(event) =>
          update((draft) => {
            draft.variant = event.target.value as TextVariant;
          })
        }
      >
        {TEXT_VARIANTS.map((variant) => (
          <MenuItem
            key={variant}
            value={variant}
            data-cy={`text-variant-${variant}`}
          >
            {variant}
          </MenuItem>
        ))}
      </Select>
    </FormWrapper>
    <AlignmentControl
      value={props.tone}
      label="Tone"
      onChange={(value) =>
        update((draft) => {
          draft.tone = value as TextTone;
        })
      }
      options={TEXT_TONES.map((tone) => (
        <ToggleButton
          size="small"
          value={tone}
          key={tone}
          data-cy={`text-tone-${tone}`}
        >
          {tone}
        </ToggleButton>
      ))}
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
