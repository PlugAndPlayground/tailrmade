import React, { useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import CheckIcon from '@mui/icons-material/Check';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { PNPStatus } from '../classes/ErrorClass';
import {
  STATUS_ERROR_ICON_TEXTURE,
  STATUS_SEVERITY,
  STATUS_WARNING_ICON_TEXTURE,
} from '../utils/constants';
import { writeTextToClipboard } from '../utils/utils';

export const isError = (status: PNPStatus): boolean =>
  status.getSeverity() >= STATUS_SEVERITY.ERROR;

const ICON_SIZE = {
  inherit: '1em',
  small: '20px',
  medium: '24px',
} as const;

export const StatusSeverityIcon: React.FC<{
  status: PNPStatus;
  fontSize?: 'inherit' | 'small' | 'medium';
  color?: string;
}> = ({ status, fontSize = 'small', color }) => {
  const source = isError(status)
    ? STATUS_ERROR_ICON_TEXTURE
    : STATUS_WARNING_ICON_TEXTURE;
  const size = ICON_SIZE[fontSize];
  const mask = `url(${source}) no-repeat center / contain`;
  return (
    <Box
      component="span"
      role="img"
      aria-label={isError(status) ? 'Error' : 'Warning'}
      sx={{
        display: 'inline-block',
        verticalAlign: 'middle',
        flexShrink: 0,
        width: size,
        height: size,
        bgcolor: color ?? status.getColor().hex(),
        mask,
        WebkitMask: mask,
      }}
    />
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
  showName?: boolean;
};

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
