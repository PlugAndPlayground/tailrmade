import React, { useEffect, useState } from 'react';
import { Box, Fade } from '@mui/material';
import type { SxProps, Theme } from '@mui/material';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { AppThemeProvider } from './dashboard/AppThemeProvider';
import {
  Caption,
  clearAllSubtitles,
  SubtitleStyle,
} from '../services/subtitles';

// a caption that was hidden stays until it has faded out
type ShownCaption = Caption & { visible: boolean };

const placementSx = ({ position, margin }: SubtitleStyle): SxProps<Theme> => {
  const edge = `${margin}vh`;
  const left = position.endsWith('left');
  const right = position.endsWith('right');
  const top = position.startsWith('Top');
  const vertical = top
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
    alignItems: left ? 'flex-start' : right ? 'flex-end' : 'center',
    // the newest caption sits nearest the screen edge
    flexDirection: top ? 'column-reverse' : 'column',
  };
};

// keeps the order captions appeared in, and the hidden ones until they faded
const mergeCaptions = (
  shown: ShownCaption[],
  captions: Caption[],
): ShownCaption[] => {
  const byId = new Map(captions.map((caption) => [caption.id, caption]));
  const kept = shown.map((old) => {
    const current = byId.get(old.id);
    return current ? { ...current, visible: true } : { ...old, visible: false };
  });
  const added = captions
    .filter((caption) => !shown.some((old) => old.id === caption.id))
    .map((caption) => ({ ...caption, visible: true }));
  return [...kept, ...added];
};

// captions with the same place stack instead of overlapping
const groupByPlace = (captions: ShownCaption[]) => {
  const groups = new Map<string, ShownCaption[]>();
  captions.forEach((caption) => {
    const key = `${caption.style.position}-${caption.style.margin}`;
    groups.set(key, [...(groups.get(key) ?? []), caption]);
  });
  return [...groups.entries()];
};

export const SubtitleOverlay: React.FC = () => {
  const [shown, setShown] = useState<ShownCaption[]>([]);

  useEffect(() => {
    const ids = [
      InterfaceController.addListener(
        ListenEvent.SubtitleChanged,
        (captions: Caption[]) =>
          setShown((previous) => mergeCaptions(previous, captions)),
      ),
      InterfaceController.addListener(
        ListenEvent.GraphConfigured,
        clearAllSubtitles,
      ),
    ];
    return () => InterfaceController.removeListeners(ids);
  }, []);

  const removeFaded = (id: string) =>
    setShown((previous) =>
      previous.filter((caption) => caption.id !== id || caption.visible),
    );

  return (
    // captions are app content, so they follow the app theme, not the editor's
    <AppThemeProvider>
      {groupByPlace(shown).map(([place, captions]) => (
        <Box
          key={place}
          sx={{
            position: 'fixed',
            ...placementSx(captions[0].style),
            display: 'flex',
            gap: '8px',
            maxWidth: '70vw',
            pointerEvents: 'none',
            zIndex: 9998,
          }}
        >
          {captions.map(({ id, text, style, visible }) => (
            <Fade
              key={id}
              in={visible}
              timeout={300}
              onExited={() => removeFaded(id)}
            >
              <Box
                data-cy="subtitle-overlay"
                sx={{
                  padding: '0.5em 0.9em',
                  borderRadius: `${style.cornerRadius}px`,
                  bgcolor: style.background,
                  color: (theme) =>
                    theme.palette.getContrastText(style.background),
                  fontFamily: (theme) => theme.typography.fontFamily,
                  fontSize: 'clamp(18px, 2.2vw, 30px)',
                  lineHeight: 1.35,
                  whiteSpace: 'pre-wrap',
                }}
              >
                {text}
              </Box>
            </Fade>
          ))}
        </Box>
      ))}
    </AppThemeProvider>
  );
};
