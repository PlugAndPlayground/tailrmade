import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  MenuItem,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { ColorPickerComponent } from '../../widgets';
import { TRgba } from '../../utils/color';
import { PRESETS, ThemePreset } from '../../utils/theme/presets';
import { listOverrides, ResolvedTheme } from '../../utils/theme/resolve';
import {
  useResolvedAppTheme,
  useSystemPrefersDark,
  useThemeDocument,
} from '../../utils/theme/store';
import {
  COLOR_ROLES,
  ColorRole,
  DENSITIES,
  Density,
  Elevation,
  ThemeTokens,
} from '../../utils/theme/tokens';
import {
  chooseThemeMode,
  chooseThemePreset,
  overrideThemeToken,
  overrideThemeTokenDebounced,
  resetAllThemeTokens,
  resetThemeToken,
} from './themeActions';
import { FormWrapper, StyledFormLabel } from './SettingsControls';

// The roles shown as a preset's identity in the picker. Not a preview of the
// app - switching is instant and non-destructive, so the creator's own UI is
// the preview. These are only here to tell one preset from another at a glance.
const IDENTITY_ROLES: ColorRole[] = [
  'primary',
  'secondary',
  'background.default',
  'background.paper',
  'text.primary',
];

/**
 * One collapsible group. The panel carries six of them and eleven color rows,
 * which is a lot of vertical space for a drawer that also holds the rest of the
 * app settings - so only the two a creator reaches for most start open.
 */
const Section: React.FC<{
  title: string;
  defaultOpen?: boolean;
  badge?: number;
  children: React.ReactNode;
}> = ({ title, defaultOpen = false, badge, children }) => {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <Box sx={{ mb: 0.5 }}>
      <Box
        data-cy={`theme-section-${title}`}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          px: 1,
          py: 0.5,
          cursor: 'pointer',
          borderRadius: 1,
          '&:hover': { bgcolor: 'action.hover' },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            transition: 'transform 0.15s',
            transform: open ? 'none' : 'rotate(-90deg)',
            color: 'text.secondary',
          }}
        />
        <Typography
          variant="caption"
          sx={{ color: 'text.secondary', fontWeight: 'bold', flex: 1 }}
        >
          {title}
        </Typography>
        {/* how many roles in this group are overridden, so a collapsed group
            never hides the fact that it differs from the preset */}
        {badge ? (
          <Chip size="small" label={badge} sx={{ height: 18, fontSize: 11 }} />
        ) : null}
      </Box>
      <Collapse in={open} timeout={150} unmountOnExit>
        <Box sx={{ pb: 1 }}>{children}</Box>
      </Collapse>
    </Box>
  );
};

/** A role's current value plus the control to put it back on the preset. */
const RoleRow: React.FC<{
  label: string;
  overridden: boolean;
  onReset: () => void;
  children: React.ReactNode;
}> = ({ label, overridden, onReset, children }) => (
  <FormWrapper>
    <Stack
      direction="row"
      sx={{ alignItems: 'center', justifyContent: 'space-between' }}
    >
      <StyledFormLabel>{label}</StyledFormLabel>
      {overridden && (
        <Tooltip title="Reset to the preset value" disableInteractive>
          <Button
            data-cy={`theme-reset-${label}`}
            size="small"
            onClick={onReset}
            sx={{ minWidth: 0, p: 0.25 }}
          >
            <RestartAltIcon fontSize="small" />
          </Button>
        </Tooltip>
      )}
    </Stack>
    {children}
  </FormWrapper>
);

const PresetRow: React.FC<{
  preset: ThemePreset;
  selected: boolean;
  mode: 'light' | 'dark';
}> = ({ preset, selected, mode }) => (
  <Box
    data-cy={`theme-preset-${preset.id}`}
    onClick={() => chooseThemePreset(preset.id)}
    sx={{
      px: 1,
      py: 0.75,
      cursor: 'pointer',
      borderRadius: 1,
      border: '1px solid',
      borderColor: selected ? 'primary.main' : 'transparent',
      bgcolor: selected ? 'action.selected' : 'transparent',
      '&:hover': { bgcolor: 'action.hover' },
    }}
  >
    <Typography variant="body2" sx={{ fontWeight: selected ? 600 : 400 }}>
      {preset.name}
    </Typography>
    <Typography variant="caption" sx={{ color: 'text.secondary' }}>
      {preset.description}
    </Typography>
    <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
      {IDENTITY_ROLES.map((role) => (
        <Box
          key={role}
          title={role}
          sx={{
            width: 18,
            height: 18,
            borderRadius: '3px',
            border: '1px solid rgba(128, 128, 128, 0.4)',
            background: preset.roles[mode][role],
          }}
        />
      ))}
    </Stack>
  </Box>
);

const ModeControl: React.FC<{ resolved: ResolvedTheme }> = ({ resolved }) => {
  const systemPrefersDark = useSystemPrefersDark();
  // three states here on purpose: this is a settings context, where the
  // creator is deliberately configuring and legibility beats compactness. The
  // end-user toggle is the two-state one.
  const value = resolved.followsSystem ? 'system' : resolved.mode;
  return (
    <FormWrapper>
      <StyledFormLabel>Mode</StyledFormLabel>
      <ToggleButtonGroup
        data-cy="theme-mode-toggle"
        size="small"
        exclusive
        value={value}
        onChange={(_, next) =>
          next !== null && chooseThemeMode(next, systemPrefersDark)
        }
        sx={{ mt: 0.5 }}
      >
        <ToggleButton value="light">Light</ToggleButton>
        <ToggleButton value="dark">Dark</ToggleButton>
        <ToggleButton value="system">System</ToggleButton>
      </ToggleButtonGroup>
    </FormWrapper>
  );
};

const SelectControl = <T extends string>({
  label,
  value,
  options,
  overridden,
  onChange,
  onReset,
}: {
  label: string;
  value: T;
  options: readonly T[];
  overridden: boolean;
  onChange: (value: T) => void;
  onReset: () => void;
}) => (
  <RoleRow label={label} overridden={overridden} onReset={onReset}>
    <Select
      size="small"
      value={value}
      onChange={(event) => onChange(event.target.value as T)}
      sx={{ mt: 0.5 }}
    >
      {options.map((option) => (
        <MenuItem key={option} value={option}>
          {option}
        </MenuItem>
      ))}
    </Select>
  </RoleRow>
);

const NumberControl: React.FC<{
  label: string;
  value: number;
  overridden: boolean;
  onChange: (value: number) => void;
  onReset: () => void;
}> = ({ label, value, overridden, onChange, onReset }) => (
  <RoleRow label={label} overridden={overridden} onReset={onReset}>
    <TextField
      size="small"
      type="number"
      value={value}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (!Number.isNaN(next)) {
          onChange(next);
        }
      }}
      sx={{ mt: 0.5 }}
    />
  </RoleRow>
);

/**
 * App-wide theme settings. Lives in the right drawer's App tab rather than in
 * the dashboard's own chrome: the theme is a property of the app, not of the
 * surface being edited, and it has to stay reachable OUTSIDE edit mode - many
 * widgets render in their disabled state while editing, so that is the one
 * mode in which you cannot judge how a theme looks.
 */
export const ThemeSettings: React.FC = () => {
  const resolved = useResolvedAppTheme();
  // subscribed so the panel re-renders on every write, including ones that
  // resolve to the same tokens (clearing an override back to the preset value)
  useThemeDocument();

  const overrides = listOverrides(resolved);
  const overriddenKeys = new Set(overrides.map((entry) => entry.key));
  const isOverridden = (key: keyof ThemeTokens) => overriddenKeys.has(key);
  const countOverridden = (keys: readonly (keyof ThemeTokens)[]) =>
    keys.filter(isOverridden).length;
  const tokens = resolved.tokens;

  return (
    <Accordion
      data-cy="theme-panel"
      disableGutters
      square
      sx={{ bgcolor: 'background.paper', '&::before': { display: 'none' } }}
    >
      <AccordionSummary
        // MUI points the icon DOWN when collapsed and rotates it up when
        // open, which reads as "already expanded, nothing inside". Flip it to
        // the disclosure-triangle convention - right when closed, down when
        // open - and move it ahead of the label, so the whole row matches the
        // groups nested inside it.
        sx={{
          px: 1,
          flexDirection: 'row',
          gap: 0.5,
          '& .MuiAccordionSummary-content': { my: 0.5 },
        }}
      >
        <ExpandMoreIcon
          fontSize="small"
          sx={{
            alignSelf: 'center',
            color: 'text.secondary',
            transition: 'transform 0.15s',
            transform: 'rotate(-90deg)',
            '.Mui-expanded > &': { transform: 'none' },
          }}
        />
        <Stack
          direction="row"
          sx={{ alignItems: 'center', gap: 1, flex: 1, minWidth: 0 }}
        >
          <Typography variant="subtitle2">App theme</Typography>
          {/* readable while collapsed: which preset is in force, and whether
              anything has been changed away from it */}
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            {resolved.presetId}
            {resolved.followsSystem ? '' : ` · ${resolved.mode}`}
          </Typography>
          {overrides.length > 0 && (
            <Chip
              size="small"
              label={`${overrides.length} changed`}
              sx={{ height: 18, fontSize: 11 }}
            />
          )}
          {/* the closed row still shows something OF the theme, so the box
              cannot read as empty - and the swatches change as you switch
              preset, which is the clearest hint that there is more in here */}
          <Stack direction="row" sx={{ gap: 0.375, flex: 'none' }}>
            {IDENTITY_ROLES.map((role) => (
              <Box
                key={role}
                sx={{
                  width: 12,
                  height: 12,
                  borderRadius: '2px',
                  border: '1px solid rgba(128, 128, 128, 0.4)',
                  background: tokens[role],
                }}
              />
            ))}
          </Stack>
        </Stack>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 0.5, pt: 0 }}>
        {overrides.length > 0 && (
          <Alert
            data-cy="theme-override-notice"
            severity="info"
            sx={{ mb: 1, fontSize: '0.75rem' }}
            action={
              <Button
                data-cy="theme-reset-all"
                size="small"
                onClick={resetAllThemeTokens}
              >
                Reset all
              </Button>
            }
          >
            {/* switching preset keeps these, so a new preset can look wrong
              until the creator knows they are here */}
            {overrides.length} role{overrides.length === 1 ? '' : 's'}{' '}
            overridden — these stay when you switch preset:
            <Stack
              direction="row"
              spacing={0.5}
              sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}
            >
              {overrides.map((entry) => (
                <Chip
                  key={entry.key}
                  size="small"
                  label={entry.key}
                  onDelete={() => resetThemeToken(entry.key)}
                />
              ))}
            </Stack>
          </Alert>
        )}

        {resolved.warnings.map((warning) => (
          <Alert
            key={`${warning.role}-${warning.against}`}
            data-cy="theme-contrast-warning"
            severity="warning"
            sx={{ mb: 1, fontSize: '0.75rem' }}
          >
            {warning.message}
          </Alert>
        ))}

        <Section title="Preset">
          {PRESETS.map((preset) => (
            <PresetRow
              key={preset.id}
              preset={preset}
              selected={preset.id === resolved.presetId}
              mode={resolved.mode}
            />
          ))}
        </Section>

        <Section title="Mode">
          <ModeControl resolved={resolved} />
        </Section>

        <Section title="Colors">
          {COLOR_ROLES.map((role) => (
            <RoleRow
              key={role}
              label={role}
              overridden={isOverridden(role)}
              onReset={() => resetThemeToken(role)}
            >
              <ColorPickerComponent
                // remounted when the resolved value changes from outside (a
                // preset switch, a reset) - the picker holds its own state and
                // deliberately does not sync from props, see its comment
                key={`${role}-${tokens[role]}`}
                defaultColor={TRgba.fromString(tokens[role])}
                showAlphaSlider
                onChange={(color) =>
                  overrideThemeTokenDebounced(role, color.toString())
                }
              />
            </RoleRow>
          ))}
        </Section>

        <Section title="Typography">
          <RoleRow
            label="fontFamily"
            overridden={isOverridden('fontFamily')}
            onReset={() => resetThemeToken('fontFamily')}
          >
            <TextField
              size="small"
              value={tokens.fontFamily}
              onChange={(event) =>
                overrideThemeToken('fontFamily', event.target.value)
              }
              sx={{ mt: 0.5 }}
            />
          </RoleRow>
          <RoleRow
            label="fontFamilyMono"
            overridden={isOverridden('fontFamilyMono')}
            onReset={() => resetThemeToken('fontFamilyMono')}
          >
            <TextField
              size="small"
              value={tokens.fontFamilyMono}
              onChange={(event) =>
                overrideThemeToken('fontFamilyMono', event.target.value)
              }
              sx={{ mt: 0.5 }}
            />
          </RoleRow>
          <NumberControl
            label="fontSizeScalar"
            value={tokens.fontSizeScalar}
            overridden={isOverridden('fontSizeScalar')}
            onChange={(value) => overrideThemeToken('fontSizeScalar', value)}
            onReset={() => resetThemeToken('fontSizeScalar')}
          />
        </Section>

        <Section title="Geometry">
          <NumberControl
            label="radius"
            value={tokens.radius}
            overridden={isOverridden('radius')}
            onChange={(value) => overrideThemeToken('radius', value)}
            onReset={() => resetThemeToken('radius')}
          />
          <SelectControl<Density>
            label="density (controls)"
            value={tokens.density}
            options={DENSITIES}
            overridden={isOverridden('density')}
            onChange={(value) => overrideThemeToken('density', value)}
            onReset={() => resetThemeToken('density')}
          />
          <NumberControl
            label="spacingUnit (layout)"
            value={tokens.spacingUnit}
            overridden={isOverridden('spacingUnit')}
            onChange={(value) => overrideThemeToken('spacingUnit', value)}
            onReset={() => resetThemeToken('spacingUnit')}
          />
          <SelectControl<Elevation>
            label="elevation"
            value={tokens.elevation}
            options={['none', 'subtle', 'raised'] as const}
            overridden={isOverridden('elevation')}
            onChange={(value) => overrideThemeToken('elevation', value)}
            onReset={() => resetThemeToken('elevation')}
          />
        </Section>

        <Section title="Default variants">
          <SelectControl
            label="button"
            value={tokens.buttonVariant}
            options={['contained', 'outlined', 'text'] as const}
            overridden={isOverridden('buttonVariant')}
            onChange={(value) => overrideThemeToken('buttonVariant', value)}
            onReset={() => resetThemeToken('buttonVariant')}
          />
          <SelectControl
            label="input"
            value={tokens.inputVariant}
            options={['outlined', 'filled', 'standard'] as const}
            overridden={isOverridden('inputVariant')}
            onChange={(value) => overrideThemeToken('inputVariant', value)}
            onReset={() => resetThemeToken('inputVariant')}
          />
        </Section>

        {/* stated rather than left for creators to discover */}
        <Typography
          variant="caption"
          sx={{ display: 'block', px: 1, py: 1, color: 'text.secondary' }}
        >
          The theme currently reaches widget nodes and containers. Data grids,
          code editors, plots and Draw/Pixi nodes keep their own colors.
        </Typography>
      </AccordionDetails>
    </Accordion>
  );
};
