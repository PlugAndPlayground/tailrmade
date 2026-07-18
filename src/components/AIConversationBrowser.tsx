import React, { useState } from 'react';
import {
  Box,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  Add as AddIcon,
  AutoAwesome as AutoAwesomeIcon,
} from '@mui/icons-material';
import { AIBackend } from '../services/AIBackend';
import {
  AI_AGENT_PROVIDERS,
  getDefaultAIModel,
  getAIAgentProvider,
  getAIModelsForProvider,
  type AIAgentProvider,
} from '../services/aiModels';
import {
  CLOUD_MODE,
  EXECUTION_LOCATION_CLOUD,
  EXECUTION_LOCATION_LOCAL,
  type ExecutionLocation,
} from '../services/shared-types';
import AIConversationEditor from './AIConversationEditor';
import { useAIAgentModelPreference } from './useAIAgentModelPreference';
import { useUserPreferences } from './useUserPreferences';

const panelBorder = '1px solid rgba(255,255,255,0.16)';
const panelSurface = 'rgba(255,255,255,0.08)';
const secondaryText = 'rgba(255,255,255,0.72)';

const selectSx = {
  color: '#fff',
  bgcolor: panelSurface,
  '& .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(255,255,255,0.22)',
  },
  '&:hover .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(255,255,255,0.38)',
  },
  '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
    borderColor: 'rgba(255,255,255,0.62)',
  },
  '& .MuiSelect-icon': {
    color: '#fff',
  },
  '& .MuiSelect-select': { py: 0.9 },
};

const AIConversationBrowser = () => {
  const backendConversationNames = Object.keys(
    AIBackend.getInstance().conversations,
  );
  const [conversations, setConversations] = useState(
    backendConversationNames.length > 0
      ? backendConversationNames
      : ['Conversation 1'],
  );
  const [selectedConversation, setSelectedConversation] = useState(
    backendConversationNames[0] || 'Conversation 1',
  );
  const [selectedModel, setSelectedModel] = useAIAgentModelPreference();
  const selectedProvider = getAIAgentProvider(selectedModel);
  const [preferences, savePreferences] = useUserPreferences();
  const aiLocation = CLOUD_MODE
    ? preferences.aiLocation
    : EXECUTION_LOCATION_LOCAL;
  const [performActions, setPerformActions] = useState(true);

  const createConversation = () => {
    const newConversationId = `Conversation ${conversations.length + 1}`;
    AIBackend.getInstance().conversations[newConversationId] = [];
    setConversations((prev) => [...prev, newConversationId]);
    setSelectedConversation(newConversationId);
  };

  return (
    <Box
      data-cy="AI Helper Workspace"
      sx={{
        height: 'calc(100dvh - 56px)',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'transparent',
        color: '#fff',
        borderLeft: panelBorder,
      }}
    >
      <Box
        sx={{
          px: 2,
          pt: 1.5,
          pb: 1.25,
          bgcolor: panelSurface,
          borderBottom: panelBorder,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AutoAwesomeIcon sx={{ fontSize: 20, color: '#fff' }} />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.1 }}>
              AI Helper
            </Typography>
            <Typography variant="caption" sx={{ color: secondaryText }}>
              Agent workspace
            </Typography>
          </Box>
          <Tooltip title="New conversation">
            <IconButton
              aria-label="New conversation"
              onClick={createConversation}
              sx={{
                color: '#fff',
                border: panelBorder,
                bgcolor: panelSurface,
                '&:hover': {
                  bgcolor: 'rgba(255,255,255,0.13)',
                },
              }}
            >
              <AddIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Box>

        <Stack spacing={1} sx={{ mt: 1.5 }}>
          <FormControl fullWidth>
            <Typography variant="caption" sx={{ color: secondaryText }}>
              Provider
            </Typography>
            <Select
              variant="outlined"
              data-cy="AI Agent Provider Select"
              value={selectedProvider}
              onChange={(event) => {
                const provider = event.target.value as AIAgentProvider;
                setSelectedModel(getDefaultAIModel(provider));
              }}
              sx={selectSx}
            >
              {AI_AGENT_PROVIDERS.map((provider) => (
                <MenuItem key={provider.value} value={provider.value}>
                  {provider.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <Typography variant="caption" sx={{ color: secondaryText }}>
              Conversation
            </Typography>
            <Select
              variant="outlined"
              data-cy="Select Conversation"
              value={selectedConversation}
              onChange={(event) => setSelectedConversation(event.target.value)}
              sx={selectSx}
            >
              {conversations.map((conversation) => (
                <MenuItem key={conversation} value={conversation}>
                  {conversation}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <Typography variant="caption" sx={{ color: secondaryText }}>
              Run AI assistant
            </Typography>
            <Select
              variant="outlined"
              data-cy="AI Execution Location Select"
              value={aiLocation}
              onChange={(event) =>
                savePreferences({
                  aiLocation: event.target.value as ExecutionLocation,
                })
              }
              sx={selectSx}
            >
              <MenuItem value={EXECUTION_LOCATION_CLOUD} disabled={!CLOUD_MODE}>
                Cloud
              </MenuItem>
              <MenuItem value={EXECUTION_LOCATION_LOCAL}>
                Local companion
              </MenuItem>
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <Typography variant="caption" sx={{ color: secondaryText }}>
              Model
            </Typography>
            <Select
              variant="outlined"
              data-cy="AI Agent Model Select"
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              sx={selectSx}
            >
              {getAIModelsForProvider(selectedProvider).map((model) => (
                <MenuItem key={model.value} value={model.value}>
                  {model.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControlLabel
            sx={{
              m: 0,
              px: 1,
              py: 0.25,
              minHeight: 38,
              justifyContent: 'space-between',
              bgcolor: panelSurface,
              border: panelBorder,
              '& .MuiFormControlLabel-label': {
                color: '#fff',
                fontSize: '0.84rem',
              },
            }}
            label="Perform actions"
            labelPlacement="start"
            control={
              <Switch
                checked={performActions}
                onChange={(event) => setPerformActions(event.target.checked)}
                inputProps={{
                  'aria-label': 'Perform actions',
                  'data-cy': 'AI Perform Actions Toggle',
                }}
              />
            }
          />
        </Stack>
      </Box>

      <Divider />

      <AIConversationEditor
        conversationID={selectedConversation}
        selectedModel={selectedModel}
        performActions={performActions}
      />
    </Box>
  );
};

export default AIConversationBrowser;
