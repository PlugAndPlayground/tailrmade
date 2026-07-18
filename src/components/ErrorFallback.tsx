import React, { useState } from 'react';
import {
  Box,
  Button,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Stack,
  CircularProgress,
  Alert,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  ExpandMore as ExpandMoreIcon,
  Add as AddIcon,
  Save as SaveIcon,
  Refresh as RefreshIcon,
  ContentCopy as ContentCopyIcon,
} from '@mui/icons-material';
import PPStorage from '../PPStorage';
import PPGraph from '../classes/GraphClass';

interface ErrorFallbackProps {
  error: Error;
  resetErrorBoundary?: () => void;
  inline?: boolean; // If true, renders inline instead of fixed overlay
}

function ErrorFallback({
  error,
  resetErrorBoundary,
  inline = false,
}: ErrorFallbackProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [backupSuccess, setBackupSuccess] = useState(false);
  const [errorCopied, setErrorCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);

  // Show app-level recovery options when NOT in inline mode
  // inline mode is for hybrid node errors, app crashes use the full modal
  const showAppRecoveryOptions = !inline;

  const handleReload = () => {
    setIsLoading(true);
    // Force a full page reload to reinitialize Pixi and everything else
    window.location.reload();
  };

  const handleCreateNewGraph = async () => {
    setIsLoading(true);
    try {
      await PPStorage.getInstance().createEmptyGraph();
      // Force a full page reload to reinitialize everything including Pixi
      window.location.reload();
    } catch (e) {
      console.error('Failed to create new graph:', e);
      // Force reload as fallback
      window.location.reload();
    }
  };

  const handleDownloadBackup = async () => {
    setIsLoading(true);
    try {
      // Download the current version of the graph
      await PPStorage.getInstance().downloadCurrentGraph(true);
      setBackupSuccess(true);
      setTimeout(() => setBackupSuccess(false), 3000);
    } catch (e) {
      console.error('Failed to download backup:', e);
      alert('Failed to download backup. The graph may be too corrupted.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleContactUs = () => {
    window.location.href =
      'mailto:support@tailrmade.app?subject=App Crash Report&body=Please describe what you were doing when the app crashed:%0D%0A%0D%0AError details:%0D%0A' +
      encodeURIComponent(error.message);
  };

  const handleCopyError = async () => {
    try {
      const errorText =
        error.message + (error.stack ? '\n\n' + error.stack : '');
      await navigator.clipboard.writeText(errorText);
      setErrorCopied(true);
      setTimeout(() => setErrorCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy error:', e);
    }
  };

  const handleCopyEmail = async () => {
    try {
      await navigator.clipboard.writeText('support@tailrmade.app');
      setEmailCopied(true);
      setTimeout(() => setEmailCopied(false), 2000);
    } catch (e) {
      console.error('Failed to copy email:', e);
    }
  };

  return (
    <Box
      role="alert"
      sx={{
        ...(inline
          ? {
              // Inline mode for widget/hybrid node errors
              position: 'relative',
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }
          : {
              // Fixed overlay mode for app-level crashes
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              maxWidth: 600,
              width: '90%',
              zIndex: 10000,
            }),
      }}
    >
      <Paper
        elevation={inline ? 4 : 24}
        sx={{
          p: inline ? 2 : 3,
          backgroundColor: 'black',
          backgroundImage: 'unset',
          border: 2,
          borderColor: 'error.main',
          borderRadius: 2,
          position: 'relative',
          zIndex: 1,
          ...(inline && {
            width: '100%',
            maxWidth: '100%',
          }),
        }}
      >
        <Stack spacing={inline ? 1.5 : 2}>
          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography
              variant={inline ? 'h6' : 'h5'}
              color="error"
              fontWeight="bold"
            >
              {inline ? 'Error' : 'App Crashed'}
            </Typography>
          </Box>

          {/* Alert Message - only for app-level crashes */}
          {!inline && (
            <Alert severity="error" variant="filled">
              We messed up and are truly sorry!
            </Alert>
          )}

          {/* Error Details Accordion */}
          <Accordion
            sx={{
              backgroundColor: 'background.default',
              '&:before': { display: 'none' },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2 }}>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  pr: 1,
                }}
              >
                <Typography variant="body2" fontWeight="medium">
                  Show error details
                </Typography>
                <Tooltip
                  title={errorCopied ? 'Copied!' : 'Copy error details'}
                  PopperProps={{
                    sx: { zIndex: 10001 },
                  }}
                >
                  <Box
                    component="span"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleCopyError();
                    }}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                      '&:hover': {
                        backgroundColor: 'action.hover',
                      },
                    }}
                  >
                    <ContentCopyIcon fontSize="small" />
                  </Box>
                </Tooltip>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              <Box
                component="pre"
                sx={{
                  fontSize: 11,
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  p: 2,
                  borderRadius: 1,
                  overflow: 'auto',
                  maxHeight: 200,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  m: 0,
                }}
              >
                {error.message}
                {error.stack && '\n\n' + error.stack}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Action Buttons */}
          <Stack spacing={1.5} sx={{ mt: 2 }}>
            {resetErrorBoundary && (
              <Button
                variant="contained"
                size={inline ? 'medium' : 'large'}
                startIcon={<RefreshIcon />}
                onClick={resetErrorBoundary}
                fullWidth
              >
                Try Again
              </Button>
            )}

            {showAppRecoveryOptions && (
              <>
                <Tooltip
                  title={backupSuccess ? 'Downloaded backup successfully!' : ''}
                  open={backupSuccess}
                  PopperProps={{
                    sx: { zIndex: 10001 },
                  }}
                >
                  <Button
                    variant="contained"
                    size="large"
                    startIcon={
                      isLoading ? <CircularProgress size={20} /> : <SaveIcon />
                    }
                    onClick={handleDownloadBackup}
                    disabled={isLoading}
                    fullWidth
                  >
                    Download backup
                  </Button>
                </Tooltip>

                <Box sx={{ display: 'flex', gap: 1.5 }}>
                  <Button
                    variant="outlined"
                    size="medium"
                    startIcon={
                      isLoading ? (
                        <CircularProgress size={20} />
                      ) : (
                        <RefreshIcon />
                      )
                    }
                    onClick={handleReload}
                    disabled={isLoading}
                    fullWidth
                  >
                    Reload App
                  </Button>

                  <Button
                    variant="outlined"
                    size="medium"
                    startIcon={
                      isLoading ? <CircularProgress size={20} /> : <AddIcon />
                    }
                    onClick={handleCreateNewGraph}
                    disabled={isLoading}
                    fullWidth
                  >
                    Create New App
                  </Button>
                </Box>
              </>
            )}

            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button
                variant="text"
                size="large"
                onClick={handleContactUs}
                fullWidth
                color="secondary"
              >
                Contact us
              </Button>
              <Tooltip
                title={emailCopied ? 'Copied!' : 'Copy email address'}
                PopperProps={{
                  sx: { zIndex: 10001 },
                }}
              >
                <IconButton
                  onClick={() => void handleCopyEmail()}
                  color="secondary"
                  sx={{
                    '&:hover': { backgroundColor: 'rgba(156, 39, 176, 0.04)' },
                  }}
                >
                  <ContentCopyIcon />
                </IconButton>
              </Tooltip>
            </Box>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}

export default ErrorFallback;
