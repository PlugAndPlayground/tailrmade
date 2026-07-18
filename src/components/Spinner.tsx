import React from 'react';
import { CircularProgress, Paper, Typography } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

interface SpinnerProps {
  visible: boolean;
  message: string;
  isSuccess?: boolean;
  isExiting?: boolean;
}

const Spinner: React.FC<SpinnerProps> = ({
  visible,
  message,
  isSuccess = false,
  isExiting = false,
}) => {
  if (!visible) return null;

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'fixed',
        top: '20px',
        left: '50%',
        transform: `translateX(-50%) translateY(${isExiting ? '-20px' : '0px'})`,
        zIndex: 9999,
        padding: '12px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        borderRadius: '8px',
        minWidth: '200px',
        bgcolor: 'background.default',
        opacity: isExiting ? 0 : 1,
        transition: 'all 0.3s ease-out',
      }}
    >
      {isSuccess ? (
        <CheckCircleIcon sx={{ color: 'success.main' }} />
      ) : (
        <CircularProgress size={24} color="primary" />
      )}
      <Typography variant="body2">{message}</Typography>
    </Paper>
  );
};

export default Spinner;
