import React, { useCallback, useEffect, useState } from 'react';
import {
  Typography,
  Box,
  CircularProgress,
  Alert,
  Button,
  Divider,
  List,
  ListItem,
  ListItemText,
  Container,
  FormControlLabel,
  Radio,
  Dialog,
  DialogTitle,
  DialogContent,
  TextField,
  IconButton,
  Chip,
} from '@mui/material';
import CloudIcon from '@mui/icons-material/Cloud';
import ComputerIcon from '@mui/icons-material/Computer';
import VpnKeyIcon from '@mui/icons-material/VpnKey';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import InputAdornment from '@mui/material/InputAdornment';
import PsychologyIcon from '@mui/icons-material/Psychology';
import CloudQueueIcon from '@mui/icons-material/CloudQueue';
import StorageIcon from '@mui/icons-material/Storage';
import {
  ApiKeySummary,
  FirebaseAppHandler,
  QuotaInfo,
} from '../firebase/FirebaseAppHandler';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import {
  TOKEN_LIMITS,
  COMPANION_REQUEST_LIMITS,
  EXECUTION_LOCATION_CLOUD,
  EXECUTION_LOCATION_LOCAL,
  type ExecutionLocation,
  getEffectiveDailyUsage,
  type UserData,
} from '../services/shared-types';
import { useUserPreferences } from '../components/useUserPreferences';
import AccountDataControls from './AccountDataControls';

// Check if two dates are the same day

interface UserProfileProps {
  onSignOut?: () => void;
  onAccountDeleted?: () => void;
}

const PROFILE_CARD_SX = {
  p: 1.5,
  borderRadius: 1,
  bgcolor: 'background.paper',
  border: '1px solid',
  borderColor: 'divider',
};

const PROFILE_CARD_ICON_SX = {
  fontSize: 20,
  mr: 1,
  color: 'primary.main',
};

const PROFILE_SETTING_ICON_SX = {
  fontSize: 20,
  mr: 1.5,
  color: 'primary.main',
};

interface ProfileUsageCardProps {
  icon: React.ReactNode;
  label: string;
  currentUsage: number;
  maxAllowed: number;
  unit: string;
  formatCurrentUsage?: (usage: number) => string;
}

const ProfileUsageCard: React.FC<ProfileUsageCardProps> = ({
  icon,
  label,
  currentUsage,
  maxAllowed,
  unit,
  formatCurrentUsage = (usage) => usage.toLocaleString(),
}) => {
  const percentage =
    maxAllowed > 0 ? Math.min((currentUsage / maxAllowed) * 100, 100) : 0;

  return (
    <Box sx={PROFILE_CARD_SX}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        {icon}
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1 }}>
        <Typography variant="h6" sx={{ fontWeight: 600 }}>
          {formatCurrentUsage(currentUsage)}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
          / {maxAllowed.toLocaleString()} {unit}
        </Typography>
      </Box>
      <Box
        sx={{
          width: '100%',
          height: 6,
          bgcolor: 'background.default',
          borderRadius: 1,
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: `${percentage}%`,
            height: '100%',
            bgcolor: 'primary.main',
            transition: 'width 0.3s ease',
          }}
        />
      </Box>
    </Box>
  );
};

const UserProfile: React.FC<UserProfileProps> = ({
  onSignOut,
  onAccountDeleted,
}) => {
  const [user, setUser] = useState<any>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<QuotaInfo | null>(null);
  const [preferences, savePreferences] = useUserPreferences();
  const { companionLocation } = preferences;
  const [apiKeysDialogOpen, setApiKeysDialogOpen] = useState(false);
  const [apiKeys, setApiKeys] = useState<ApiKeySummary[]>([]);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyDomain, setNewKeyDomain] = useState('');
  const [newKeyValue, setNewKeyValue] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const auth = FirebaseAppHandler.getInstance();

  const deepUpdate = async (force: boolean = false) => {
    setLoading(true);
    try {
      const user = auth.getCurrentUser();

      if (!user) {
        setLoading(false);
        return;
      }

      setUser(user);
      if (force) {
        await auth.refreshCurrentUserData();
      }
      const updatedUserData = auth.getCurrentUserData();
      setUserData(updatedUserData);

      if (user) {
        await fetchStorageQuota();
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void deepUpdate();
    const listenID = InterfaceController.addListener(
      ListenEvent.UserIsLoggedIn,
      () => {
        void deepUpdate();
      },
    );
    return () => {
      InterfaceController.removeListener(listenID);
    };
  }, []);

  const fetchStorageQuota = async () => {
    try {
      const quotaInfo = await auth.getStorageQuota();
      setQuota(quotaInfo);
    } catch (err) {
      console.error('Error fetching storage quota:', err);
    }
  };

  const handleSignOut = async () => {
    try {
      await auth.signOutUser();
      if (onSignOut) {
        onSignOut();
      }
    } catch (error) {
      console.error('Error signing out:', error);
      setError('Failed to sign out');
    }
  };

  const handleCompanionLocationChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const newLocation = event.target.value as ExecutionLocation;
    savePreferences({
      companionLocation: newLocation,
    });
  };

  const fetchApiKeys = useCallback(async () => {
    const keys = await auth.getApiKeys();
    setApiKeys(keys);
  }, [auth]);

  useEffect(() => {
    if (apiKeysDialogOpen) {
      void fetchApiKeys();
    }
  }, [apiKeysDialogOpen, fetchApiKeys]);

  const handleAddApiKey = async () => {
    if (!newKeyName || !newKeyValue || !newKeyDomain) {
      return;
    }

    const success = await auth.upsertApiKey({
      name: newKeyName.trim(),
      key: newKeyValue.trim(),
      domain: newKeyDomain.trim(),
    });

    if (success) {
      await fetchApiKeys();
      setNewKeyName('');
      setNewKeyValue('');
      setNewKeyDomain('');
    }
  };

  const handleRemoveApiKey = async (name: string) => {
    const success = await auth.deleteApiKey(name);
    if (success) {
      setApiKeys((prev) => prev.filter((key) => key.name !== name));
    }
  };

  if (loading) {
    return (
      <Container sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  const aiDailyUsage = getEffectiveDailyUsage(
    userData?.aiUsage?.tokensUsedLastDay || 0,
    userData?.aiUsage?.tokensLastDayUsed,
  );
  const companionDailyUsage = getEffectiveDailyUsage(
    userData?.companionUsage?.tokensUsedLastDay || 0,
    userData?.companionUsage?.tokensLastDayUsed,
  );

  return (
    <>
      {/* Compact Header with Sign Out */}
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
            {userData?.name || user?.displayName || 'User'}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {userData?.email || user?.email || 'Not available'}
          </Typography>
          {userData?.accountTier && (
            <Chip
              label={
                userData.accountTier.charAt(0).toUpperCase() +
                userData.accountTier.slice(1)
              }
              size="small"
              color="primary"
              sx={{ fontWeight: 600 }}
              data-cy="account-type"
            />
          )}
        </Box>
        <Button
          variant="outlined"
          color="secondary"
          size="small"
          onClick={handleSignOut}
          data-cy="sign-out-button"
          sx={{ minWidth: 'auto', textTransform: 'none' }}
        >
          Log out
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Usage Stats in Cards */}
      {userData && (
        <Box sx={{ mb: 4 }}>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              mb: 0.5,
              px: 0.5,
            }}
          >
            <Typography
              variant="subtitle2"
              sx={{ fontWeight: 600, color: 'text.secondary' }}
            >
              Usage
            </Typography>
            <Button
              size="small"
              color="secondary"
              onClick={() => deepUpdate(true)}
              sx={{ textTransform: 'none', minWidth: 'auto' }}
            >
              Refresh
            </Button>
          </Box>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            <ProfileUsageCard
              icon={<PsychologyIcon sx={PROFILE_CARD_ICON_SX} />}
              label="AI assistance"
              currentUsage={aiDailyUsage}
              maxAllowed={TOKEN_LIMITS[userData.accountTier] || 0}
              unit="tokens"
            />

            {quota && (
              <ProfileUsageCard
                icon={<StorageIcon sx={PROFILE_CARD_ICON_SX} />}
                label="Cloud Storage"
                currentUsage={quota.currentUsage}
                maxAllowed={quota.maxAllowed}
                unit="MB"
                formatCurrentUsage={(usage) => usage.toFixed(1)}
              />
            )}

            {companionLocation === EXECUTION_LOCATION_CLOUD && (
              <ProfileUsageCard
                icon={<CloudQueueIcon sx={PROFILE_CARD_ICON_SX} />}
                label="Cloud Companion"
                currentUsage={companionDailyUsage}
                maxAllowed={COMPANION_REQUEST_LIMITS[userData.accountTier] || 0}
                unit="requests"
              />
            )}
          </Box>
        </Box>
      )}

      {/* Settings Section */}
      <Box sx={{ mt: 2 }}>
        <Typography
          variant="subtitle2"
          sx={{ mb: 1, px: 0.5, fontWeight: 600, color: 'text.secondary' }}
        >
          Settings
        </Typography>

        {/* Companion Location */}
        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            ...PROFILE_CARD_SX,
            mb: 1.5,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center' }}>
            {companionLocation === EXECUTION_LOCATION_CLOUD ? (
              <CloudIcon sx={PROFILE_SETTING_ICON_SX} />
            ) : (
              <ComputerIcon sx={PROFILE_SETTING_ICON_SX} />
            )}
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Companion location
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {companionLocation === EXECUTION_LOCATION_CLOUD
                  ? 'Running in cloud'
                  : 'Running locally'}
              </Typography>
            </Box>
          </Box>
          <FormControlLabel
            control={
              <Radio
                checked={companionLocation === EXECUTION_LOCATION_CLOUD}
                onChange={(e) => handleCompanionLocationChange(e as any)}
                value={EXECUTION_LOCATION_CLOUD}
                size="small"
              />
            }
            label="Cloud"
            sx={{ mr: 0 }}
          />
          <FormControlLabel
            control={
              <Radio
                checked={companionLocation === EXECUTION_LOCATION_LOCAL}
                onChange={(e) => handleCompanionLocationChange(e as any)}
                value={EXECUTION_LOCATION_LOCAL}
                size="small"
              />
            }
            label="Local"
          />
        </Box>

        {/* API Keys */}
        {companionLocation === EXECUTION_LOCATION_CLOUD && (
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              ...PROFILE_CARD_SX,
              cursor: 'pointer',
              '&:hover': {
                bgcolor: 'action.hover',
              },
            }}
            onClick={() => setApiKeysDialogOpen(true)}
            data-cy="manage-api-keys-button"
          >
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <VpnKeyIcon sx={PROFILE_SETTING_ICON_SX} />
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  API Keys
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Manage your API keys
                </Typography>
              </Box>
            </Box>
            <IconButton size="small" edge="end">
              <AddIcon />
            </IconButton>
          </Box>
        )}

        <Box sx={{ mt: 1.5 }}>
          <AccountDataControls onAccountDeleted={onAccountDeleted} />
        </Box>
      </Box>

      {/* API Keys Dialog */}
      <Dialog
        open={apiKeysDialogOpen}
        onClose={() => setApiKeysDialogOpen(false)}
        maxWidth="md"
        fullWidth
        sx={{ zIndex: 9999 }}
        slotProps={{
          paper: {
            sx: {
              bgcolor: 'background.default',
              backgroundImage:
                'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))',
            },
          },
        }}
      >
        <DialogTitle>
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
            }}
          >
            <Box>
              Manage API Keys
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ mt: 0.5 }}
              >
                Store API keys securely for use in HTTP nodes with $TM_KEY{'{'}
                key_name{'}'} syntax
              </Typography>
            </Box>
            <IconButton
              aria-label="close"
              onClick={() => setApiKeysDialogOpen(false)}
              sx={{ ml: 1 }}
              data-cy="close-api-keys-button"
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent>
          {apiKeys.length === 0 ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              No API keys stored yet. Add one below.
            </Alert>
          ) : (
            <>
              <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
                Your API Keys
              </Typography>
              <List sx={{ mb: 2 }}>
                {apiKeys.map((apiKey) => (
                  <ListItem
                    key={apiKey.name}
                    sx={{
                      bgcolor: 'background.paper',
                      borderRadius: 1,
                      border: '1px solid',
                      borderColor: 'divider',
                      mb: 1,
                    }}
                    secondaryAction={
                      <IconButton
                        edge="end"
                        onClick={() => void handleRemoveApiKey(apiKey.name)}
                        color="error"
                        data-cy="remove-api-key-button"
                        data-key-name={apiKey.name}
                        aria-label={`Delete API key ${apiKey.name}`}
                      >
                        <DeleteIcon />
                      </IconButton>
                    }
                  >
                    <ListItemText
                      primary={
                        <Box
                          sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontFamily: 'monospace', fontWeight: 600 }}
                          >
                            {apiKey.name}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            • {apiKey.domain}
                          </Typography>
                        </Box>
                      }
                      secondary={
                        <Box
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.5,
                            mt: 0.5,
                          }}
                        >
                          <Typography
                            variant="caption"
                            sx={{
                              fontFamily: 'monospace',
                              color: 'secondary.main',
                            }}
                          >
                            Use as: $TM_KEY{'{'}
                            {apiKey.name}
                            {'}'}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => {
                              void navigator.clipboard.writeText(
                                `$TM_KEY{${apiKey.name}}`,
                              );
                            }}
                            sx={{ ml: 0.5, p: 0.5 }}
                            aria-label="Copy key usage syntax"
                          >
                            <ContentCopyIcon sx={{ fontSize: 14 }} />
                          </IconButton>
                        </Box>
                      }
                      slotProps={{
                        secondary: { component: 'div' },
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </>
          )}

          <Divider sx={{ my: 2 }} />

          <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>
            Add New API Key
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Key Name"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                fullWidth
                placeholder="openai"
                size="small"
                helperText="A name to reference this key in your apps"
                slotProps={{ htmlInput: { 'data-cy': 'api-key-name-input' } }}
              />
              <TextField
                label="API Domain"
                value={newKeyDomain}
                onChange={(e) => setNewKeyDomain(e.target.value)}
                fullWidth
                placeholder="api.openai.com"
                size="small"
                helperText="The domain of the API service"
                slotProps={{
                  htmlInput: { 'data-cy': 'api-key-domain-input' },
                }}
              />
            </Box>
            <TextField
              label="API Key Value"
              type={showApiKey ? 'text' : 'password'}
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
              fullWidth
              placeholder="Enter your API key"
              size="small"
              helperText="Your actual API key or token"
              slotProps={{
                htmlInput: { 'data-cy': 'api-key-value-input' },
                input: {
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle API key visibility"
                        onClick={() => setShowApiKey(!showApiKey)}
                        edge="end"
                        size="small"
                      >
                        {showApiKey ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
            />
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => void handleAddApiKey()}
              disabled={!newKeyName || !newKeyDomain || !newKeyValue}
              data-cy="add-api-key-button"
              sx={{ alignSelf: 'flex-start' }}
            >
              Add API Key
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default UserProfile;
