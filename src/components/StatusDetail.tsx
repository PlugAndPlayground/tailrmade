import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import ErrorIcon from '@mui/icons-material/Error';
// the filled circle and triangle, matching Icon_Error.svg / Icon_Warning.svg
// drawn on the canvas - the list should teach the same two silhouettes
import WarningIcon from '@mui/icons-material/Warning';
import { PNPStatus } from '../classes/ErrorClass';
import { STATUS_SEVERITY } from '../utils/constants';
import { writeTextToClipboard } from '../utils/utils';

export const isError = (status: PNPStatus): boolean =>
  status.getSeverity() >= STATUS_SEVERITY.ERROR;

// Severity as a shape, not only a colour - the error red, the warning orange
// and the comment yellow are not separable to a red-green colourblind eye.
export const StatusSeverityIcon: React.FC<{
  status: PNPStatus;
  fontSize?: 'inherit' | 'small' | 'medium';
}> = ({ status, fontSize = 'small' }) => {
  const sx = { color: status.getColor().hex(), verticalAlign: 'middle' };
  return isError(status) ? (
    <ErrorIcon fontSize={fontSize} sx={sx} />
  ) : (
    <WarningIcon fontSize={fontSize} sx={sx} />
  );
};

export const CopyStatusButton: React.FC<{ text: string; title?: string }> = ({
  text,
  title = 'Copy message',
}) => {
  const [copied, setCopied] = useState(false);

  return (
    <Tooltip title={copied ? 'Copied' : title}>
      <IconButton
        size="small"
        data-cy="status-copy-button"
        onClick={(event) => {
          // the row underneath is a click target of its own (it jumps the
          // canvas to the node), and copying should not also move the view
          event.stopPropagation();
          writeTextToClipboard(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? (
          <CheckIcon fontSize="inherit" />
        ) : (
          <ContentCopyIcon fontSize="inherit" />
        )}
      </IconButton>
    </Tooltip>
  );
};

type StatusDetailProps = {
  status: PNPStatus;
  // the node list already names the node in the row above, the popover does not
  showName?: boolean;
};

/**
 * One warning or error, rendered so it can actually be dealt with: the message
 * is real selectable text rather than a canvas texture or a `title` attribute,
 * and it comes with a copy button so it can be pasted into a search. Shared by
 * the node list rows and the canvas status popover so the two cannot drift.
 */
export const StatusDetail: React.FC<StatusDetailProps> = ({
  status,
  showName = true,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0.75,
        py: 0.5,
      }}
    >
      <Box sx={{ pt: '2px', flexShrink: 0 }}>
        <StatusSeverityIcon status={status} />
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        {showName && (
          <Box
            sx={{
              fontSize: '12px',
              fontWeight: 600,
              opacity: 0.8,
              mb: 0.25,
            }}
          >
            {status.getName()}
          </Box>
        )}
        <Box
          data-cy="status-detail-message"
          sx={{
            fontSize: '12px',
            fontFamily: 'Roboto Mono, monospace',
            // the message is the whole point of this component - it has to be
            // selectable, and its newlines have to survive
            userSelect: 'text',
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          }}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {status.message}
        </Box>
      </Box>
      <Box sx={{ flexShrink: 0 }}>
        <CopyStatusButton text={status.message} />
      </Box>
    </Box>
  );
};
