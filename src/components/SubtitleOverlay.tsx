import React, { useEffect, useState } from 'react';
import { Box, Fade } from '@mui/material';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { clearSubtitle } from '../services/subtitles';

export const SubtitleOverlay: React.FC = () => {
  const [text, setText] = useState('');
  // kept while the caption fades out, so it doesn't go blank first
  const [shownText, setShownText] = useState('');

  useEffect(() => {
    const ids = [
      InterfaceController.addListener(
        ListenEvent.SubtitleChanged,
        (data: string) => {
          setText(data);
          if (data) {
            setShownText(data);
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

  return (
    <Fade in={Boolean(text)} timeout={300}>
      <Box
        data-cy="subtitle-overlay"
        sx={{
          position: 'fixed',
          left: '50%',
          bottom: '8vh',
          transform: 'translateX(-50%)',
          maxWidth: '70vw',
          px: 3,
          py: 1.5,
          borderRadius: 2,
          bgcolor: 'rgba(0, 0, 0, 0.72)',
          color: '#fff',
          fontFamily: 'Roboto, Helvetica, Arial, sans-serif',
          fontSize: 'clamp(18px, 2.2vw, 30px)',
          lineHeight: 1.35,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          pointerEvents: 'none',
          zIndex: 9998,
        }}
      >
        {shownText}
      </Box>
    </Fade>
  );
};
