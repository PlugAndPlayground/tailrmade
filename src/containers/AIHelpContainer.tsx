import React, { useEffect, useState } from 'react';
import {
  Box,
  FormControl,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
  Alert,
  Link,
  Button,
  Paper,
  IconButton,
  Collapse,
} from '@mui/material';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import {
  AI_AGENT_PROVIDERS,
  getDefaultAIModel,
  getAIAgentProvider,
  getAIModelsForProvider,
  type AIAgentProvider,
} from '../services/aiModels';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { useAIAgentModelPreference } from '../components/useAIAgentModelPreference';
import { BackendGateway } from '../services/BackendGateway';

export const AIHelpContainer = () => {
  const [isAIAvailable, setIsAIAvailable] = useState(
    BackendGateway.getInstance().getIsLoggedIn(),
  );
  const [selectedModel, setSelectedModel] = useAIAgentModelPreference();
  const selectedProvider = getAIAgentProvider(selectedModel);
  const [isExpanded, setIsExpanded] = useState(true);

  useEffect(() => {
    const id = InterfaceController.addListener(
      ListenEvent.UserHasProAccessChanged,
      (enabled) => {
        setIsAIAvailable(enabled);
      },
    );
    return () => {
      InterfaceController.removeListener(id);
    };
  }, []);

  const handleModelChange = (event: any) => {
    setSelectedModel(event.target.value);
  };

  return (
    <Paper
      elevation={1}
      sx={{
        borderRadius: 1,
        overflow: 'hidden',
        pl: 1,
        py: 1,
        bgcolor: 'background.default',
      }}
    >
      <Box
        data-cy="AI Configuration"
        sx={{
          // p: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          bgcolor: 'background.paper',
          cursor: 'pointer',
          '&:hover': {
            bgcolor: 'action.hover',
          },
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <Box sx={{ pl: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
          AI assistant settings
        </Box>
        <IconButton
          size="small"
          sx={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}
        >
          <KeyboardArrowDownIcon />
        </IconButton>
      </Box>

      <Collapse in={isExpanded}>
        <Box sx={{ p: 1, bgcolor: 'background.medium' }}>
          {!isAIAvailable && (
            <Alert severity="info" sx={{ mb: 1 }}>
              AI features require being signed in.
            </Alert>
          )}
          <FormControl fullWidth disabled={!isAIAvailable} sx={{ mb: 1 }}>
            <Typography variant="caption">Provider</Typography>
            <Select
              variant="filled"
              value={selectedProvider}
              onChange={(event) => {
                const provider = event.target.value as AIAgentProvider;
                setSelectedModel(getDefaultAIModel(provider));
              }}
              size="small"
              sx={{ bgcolor: 'background.paper' }}
            >
              {AI_AGENT_PROVIDERS.map((provider) => (
                <MenuItem key={provider.value} value={provider.value}>
                  {provider.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth disabled={!isAIAvailable}>
            <Typography variant="caption">Model</Typography>
            <Select
              variant="filled"
              value={selectedModel}
              onChange={handleModelChange}
              size="small"
              sx={{
                bgcolor: 'background.paper',
                '& .MuiSelect-select': {
                  py: 1,
                },
              }}
            >
              {getAIModelsForProvider(selectedProvider).map((model) => (
                <MenuItem key={model.value} value={model.value}>
                  {model.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Collapse>
    </Paper>
  );
};

export default AIHelpContainer;
