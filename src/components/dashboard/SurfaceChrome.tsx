import React from 'react';
import { Box, Typography } from '@mui/material';
import { customTheme, MAIN_COLOR } from '../../utils/constants';

// The surface sits on a very dark background, so the chrome is themed
// light-on-dark: a dark window bezel with a subtly-lighter header bar and
// light text/accents that stay legible against the dark canvas.
const CHROME_BEZEL = '#111111';
const CHROME_SURFACE = customTheme.palette.background.default;
const CHROME_HEADER_BG = 'rgba(255, 255, 255, 0.05)';
const CHROME_BORDER = 'rgba(255, 255, 255, 0.12)';
const CHROME_TEXT = 'rgba(255, 255, 255, 0.72)';
const CHROME_DOT = 'rgba(255, 255, 255, 0.85)';
const CHROME_ACCENT = MAIN_COLOR;

export interface SurfaceChromeProps {
  children: React.ReactNode;
  label: string;
  routeSlug: string;
  // embedded surfaces (connected into another surface) read differently than
  // top-level ones
  isEmbedded: boolean;
  isDefault: boolean;
}

// Wraps a UI surface canvas preview in a browser-like frame to emphasise its
// purpose: a top-level surface gets a window bezel + header with a route badge;
// an embedded surface gets a subtle accent rail instead.
export const SurfaceChrome: React.FunctionComponent<SurfaceChromeProps> = ({
  children,
  label,
  routeSlug,
  isEmbedded,
  isDefault,
}) => {
  const normalizedRouteSlug = routeSlug.trim().replace(/^\/+/, '');
  const routeBadgeText =
    normalizedRouteSlug.length > 0 ? `/${normalizedRouteSlug}` : '/';

  return (
    <Box
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        minHeight: 0,
        overflow: 'hidden',
        border: isEmbedded
          ? '0 solid transparent'
          : `8px solid ${CHROME_BEZEL}`,
        borderRadius: isEmbedded ? 0 : '6px',
        background: CHROME_SURFACE,
      }}
    >
      {/* embedded: an accent rail down the left edge instead of a bezel */}
      {isEmbedded && (
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            width: '8px',
            background: CHROME_ACCENT,
            zIndex: 2,
          }}
        />
      )}

      {/* top-level: a browser-style header with title and route badge */}
      {!isEmbedded && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            px: 1.5,
            py: 1,
            borderBottom: `1px solid ${CHROME_BORDER}`,
            background: CHROME_HEADER_BG,
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              minWidth: 0,
            }}
          >
            <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '999px',
                  background: CHROME_DOT,
                  opacity: 0.9,
                }}
              />
              <Box
                sx={{
                  width: 7,
                  height: 7,
                  borderRadius: '999px',
                  background: CHROME_DOT,
                  opacity: 0.32,
                }}
              />
            </Box>
            <Typography
              variant="caption"
              sx={{
                fontSize: '0.68rem',
                lineHeight: 1,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: CHROME_TEXT,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {label}
            </Typography>
          </Box>

          <Box
            data-cy="surface-chrome-route-badge"
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.6,
              flexShrink: 0,
              minWidth: 0,
              maxWidth: '58%',
              px: isDefault ? 0.85 : 0.75,
              py: 0.45,
              borderRadius: '999px',
              border: `1px solid ${
                isDefault ? CHROME_ACCENT : CHROME_BORDER
              }`,
              background: isDefault
                ? CHROME_ACCENT
                : 'rgba(255, 255, 255, 0.06)',
              color: isDefault ? '#ffffff' : CHROME_TEXT,
            }}
          >
            {isDefault && (
              <Typography
                component="span"
                sx={{
                  fontSize: '0.56rem',
                  lineHeight: 1,
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  opacity: 0.92,
                  whiteSpace: 'nowrap',
                }}
              >
                Default
              </Typography>
            )}
            <Typography
              component="span"
              sx={{
                fontSize: '0.72rem',
                lineHeight: 1,
                fontWeight: isDefault ? 700 : 600,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {routeBadgeText}
            </Typography>
          </Box>
        </Box>
      )}

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          pl: isEmbedded ? '8px' : 0,
        }}
      >
        {children}
      </Box>
    </Box>
  );
};
