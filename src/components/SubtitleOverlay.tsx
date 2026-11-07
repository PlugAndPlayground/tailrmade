import React, { useEffect, useState } from 'react';
import { Box, Fade } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { AppThemeProvider } from './dashboard/AppThemeProvider';
import {
  clearSubtitle,
  DEFAULT_SUBTITLE_STYLE,
  SubtitleState,
  SubtitleStyle,
} from '../services/subtitles';

const placementSx = ({ position, margin }: SubtitleStyle): SxProps<Theme> => {
  const edge = `${margin}vh`;
  const left = position.endsWith('left');
  const right = position.endsWith('right');
  const vertical = position.startsWith('Top')
    ? { top: edge }
    : position === 'Center'
      ? { top: '50%' }
      : { bottom: edge };
  const horizontal = left
    ? { left: edge }
    : right
      ? { right: edge }
      : { left: '50%' };
  const shiftX = left || right ? '0' : '-50%';
  const shiftY = position === 'Center' ? '-50%' : '0';
  return {
    ...vertical,
    ...horizontal,
    transform: `translate(${shiftX}, ${shiftY})`,
    textAlign: left ? 'left' : right ? 'right' : 'center',
  };
};

export const SubtitleOverlay: React.FC = () => {
  const [text, setText] = useState('');
  // kept while the caption fades out, so it doesn't go blank or move first
  const [shown, setShown] = useState<SubtitleState>({
    text: '',
    style: DEFAULT_SUBTITLE_STYLE,
  });

  useEffect(() => {
    const ids = [
      InterfaceController.addListener(
        ListenEvent.SubtitleChanged,
        (data: SubtitleState) => {
          setText(data.text);
          if (data.text) {
            setShown(data);
          }
        },
      ),
      InterfaceController.addListener(
        ListenEvent.GraphConfigured,
        clearSubtitle,
      ),
    ];
    return () => InterfaceController.removeListeners(ids);
  }, []);

  const { style } = shown;
  return (
    // the caption is app content, so it follows the app theme, not the editor's
    <AppThemeProvider>
      <Fade in={Boolean(text)} timeout={300}>
        <Box
          data-cy="subtitle-overlay"
          sx={{
            position: 'fixed',
            ...placementSx(style),
            maxWidth: '70vw',
            padding: '0.5em 0.9em',
            borderRadius: `${style.cornerRadius}px`,
            bgcolor: style.background,
            color: (theme) => theme.palette.getContrastText(style.background),
            fontFamily: (theme) => theme.typography.fontFamily,
            fontSize: 'clamp(18px, 2.2vw, 30px)',
            lineHeight: 1.35,
            whiteSpace: 'pre-wrap',
            pointerEvents: 'none',
            zIndex: 9998,
          }}
        >
          {shown.text}
        </Box>
      </Fade>
    </AppThemeProvider>
  );
};
