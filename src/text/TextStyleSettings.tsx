import React from 'react';
import { Box, MenuItem, Select, Stack, ToggleButton } from '@mui/material';
import { AppThemeProvider } from '../components/dashboard/AppThemeProvider';
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
  TONE_PALETTE,
} from './model';

export type TextStyleSettingsProps = {
  props: TextProps;
  update: (mutate: (props: TextProps) => void) => void;
  children?: React.ReactNode;
};

// the inspector is editor chrome; the swatch shows the app theme's color
const ToneSwatch: React.FC<{ tone: TextTone }> = ({ tone }) => (
  <AppThemeProvider>
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        bgcolor: TONE_PALETTE[tone],
        outline: '1px solid',
        outlineColor: 'divider',
      }}
    />
  </AppThemeProvider>
);

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
          title={tone}
          aria-label={tone}
          data-cy={`text-tone-${tone}`}
        >
          <ToneSwatch tone={tone} />
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
