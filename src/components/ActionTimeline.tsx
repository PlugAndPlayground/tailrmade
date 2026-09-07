import React, { useEffect, useState } from 'react';
import {
  Box,
  Divider,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PersonIcon from '@mui/icons-material/Person';
import RadioButtonCheckedIcon from '@mui/icons-material/RadioButtonChecked';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import FirstPageIcon from '@mui/icons-material/FirstPage';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  ActionHandler,
  ActionHistorySnapshot,
  ActionSource,
} from '../classes/Action';

const sourceLabel: Record<ActionSource, string> = {
  human: 'Human',
  ai: 'AI',
};

const SourceIcon = ({ source }: { source: ActionSource }) => {
  if (source === 'ai') {
    return (
      <Tooltip title="AI action" placement="top">
        <AutoAwesomeIcon
          fontSize="small"
          data-cy="action-source-ai"
          sx={{ color: 'primary.main' }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title="Human action" placement="top">
      <PersonIcon
        fontSize="small"
        data-cy="action-source-human"
        sx={{ color: 'text.secondary' }}
      />
    </Tooltip>
  );
};

const ActionTimeline: React.FC = () => {
  const theme = useTheme();
  const [history, setHistory] = useState<ActionHistorySnapshot>(
    ActionHandler.getHistorySnapshot(),
  );

  useEffect(() => {
    setHistory(ActionHandler.getHistorySnapshot());
    const listenerId = InterfaceController.addListener(
      ListenEvent.ActionHistoryChanged,
      (nextHistory: ActionHistorySnapshot) => {
        setHistory(nextHistory);
      },
    );

    return () => {
      InterfaceController.removeListener(listenerId);
    };
  }, []);

  const jumpTo = (appliedCount: number) => {
    void ActionHandler.goToHistoryIndex(appliedCount);
  };

  return (
    <Stack
      data-cy="Action Timeline"
      sx={{
        height: '100%',
        minHeight: 0,
        color: 'text.primary',
      }}
    >
      <Box
        data-cy="action-timeline-header"
        sx={{
          px: 2,
          pb: 1.25,
          borderRadius: 1,
        }}
      >
        <Typography variant="h6" sx={{ lineHeight: 1.15, fontWeight: 700 }}>
          Actions
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: 0.5 }}>
          {history.totalCount} in chain, {history.appliedCount} applied
        </Typography>
      </Box>

      <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

      <List
        dense
        sx={{
          flex: 1,
          overflowY: 'auto',
          px: 1,
          py: 1,
          minHeight: 0,
        }}
      >
        <ListItemButton
          data-cy="action-timeline-initial"
          selected={history.appliedCount === 0}
          onClick={() => jumpTo(0)}
          sx={{
            borderRadius: 1,
            mb: 0.5,
            minHeight: 44,
            '&.Mui-selected': {
              bgcolor: alpha(theme.palette.primary.main, 0.18),
            },
          }}
        >
          <ListItemIcon sx={{ minWidth: 34 }}>
            <FirstPageIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText
            primary="Initial state"
            secondary="Before the first action"
            slotProps={{
              primary: { noWrap: true, fontSize: 13 },
              secondary: { noWrap: true, fontSize: 11 },
            }}
          />
        </ListItemButton>

        {history.entries.map((entry) => {
          const appliedCount = entry.index + 1;
          const isSelected = history.appliedCount === appliedCount;
          return (
            <ListItemButton
              key={`${entry.id}-${entry.index}`}
              data-cy={`action-timeline-row-${entry.index}`}
              selected={isSelected}
              onClick={() => jumpTo(appliedCount)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                minHeight: 48,
                opacity: entry.applied ? 1 : 0.58,
                '&.Mui-selected': {
                  bgcolor: alpha(theme.palette.primary.main, 0.18),
                  opacity: 1,
                },
              }}
            >
              <ListItemIcon sx={{ minWidth: 34 }}>
                {isSelected ? (
                  <RadioButtonCheckedIcon
                    fontSize="small"
                    sx={{ color: 'primary.main' }}
                  />
                ) : (
                  <RadioButtonUncheckedIcon
                    fontSize="small"
                    sx={{ color: 'text.disabled' }}
                  />
                )}
              </ListItemIcon>
              <ListItemText
                primary={entry.name}
                secondary={`${entry.index + 1}. ${sourceLabel[entry.source]} action`}
                slotProps={{
                  primary: { noWrap: true, fontSize: 13 },
                  secondary: { noWrap: true, fontSize: 11 },
                }}
              />
              <Box sx={{ display: 'flex', alignItems: 'center', ml: 1 }}>
                <SourceIcon source={entry.source} />
              </Box>
            </ListItemButton>
          );
        })}

        {history.entries.length === 0 && (
          <Box
            sx={{
              mx: 1,
              mt: 1,
              p: 2,
              bgcolor: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 1,
            }}
          >
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              No actions yet.
            </Typography>
          </Box>
        )}
      </List>
    </Stack>
  );
};

export default ActionTimeline;
