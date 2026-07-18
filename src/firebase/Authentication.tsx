import React, { useState, useEffect } from 'react';
import { FirebaseAppHandler } from '../firebase/FirebaseAppHandler';
import {
  Box,
  Button,
  TextField,
  Typography,
  Container,
  Paper,
  Alert,
  CircularProgress,
  Divider,
  Stack,
  IconButton,
  InputAdornment,
  Link as MuiLink,
} from '@mui/material';
import GoogleIcon from '@mui/icons-material/Google';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import UserProfile from './UserProfile';
import InterfaceController, { ListenEvent } from '../InterfaceController';
import { User } from 'firebase/auth';

enum AuthMode {
  SIGN_IN,
  SIGN_UP,
  RESET_PASSWORD,
  VERIFY_EMAIL,
  PROFILE,
}

const Authentication: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const auth = FirebaseAppHandler.getInstance();
  const [currentUser, setCurrentUser] = useState<User | null>(
    auth.getCurrentUser(),
  );
  const [mode, setMode] = useState<AuthMode>(
    currentUser ? AuthMode.PROFILE : AuthMode.SIGN_IN,
  );

  useEffect(() => {
    const listenID = InterfaceController.addListener(
      ListenEvent.UserIsLoggedIn,
      () => {
        setCurrentUser(auth.getCurrentUser());
      },
    );
    return () => {
      InterfaceController.removeListener(listenID);
    };
  });

  useEffect(() => {
    // When user signs in, switch to profile view
    if (currentUser && mode !== AuthMode.PROFILE) {
      setMode(AuthMode.PROFILE);
    }
  }, [currentUser]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      switch (mode) {
        case AuthMode.SIGN_IN:
          await auth.signInWithEmail(email, password);
          setSuccess('Signed in successfully!');
          setPassword('');
          setShowPassword(false);
          break;
        case AuthMode.SIGN_UP:
          await auth.signUpWithEmail(email, password);
          // Switch to verification waiting screen
          setMode(AuthMode.VERIFY_EMAIL);
          setPassword('');
          setShowPassword(false);
          break;
        case AuthMode.RESET_PASSWORD:
          await auth.resetPassword(email);
          setSuccess('Password reset email sent!');
          setMode(AuthMode.SIGN_IN);
          break;
      }
    } catch (error: any) {
      // Check if it's an email verification error
      if (error.message && error.message.includes('Email not verified')) {
        setMode(AuthMode.VERIFY_EMAIL);
      } else {
        setError(error.message || 'An error occurred');
      }
    }

    setLoading(false);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      await auth.signInWithGoogle();
      setSuccess('Signed in with Google successfully!');
      setPassword('');
      setShowPassword(false);
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    }

    setLoading(false);
  };

  const handleSignOut = async () => {
    setError(null);
    setSuccess(null);
    try {
      await auth.signOutUser();
      // Switch back to sign-in mode after signing out
      setMode(AuthMode.SIGN_IN);
      setSuccess('Signed out successfully!');
    } catch (error: any) {
      setError(error.message || 'An error occurred');
    }
  };

  const handleAccountDeleted = () => {
    setError(null);
    setCurrentUser(null);
    setMode(AuthMode.SIGN_IN);
    setSuccess('Your account and data were deleted.');
  };

  // Show email verification waiting screen
  if (mode === AuthMode.VERIFY_EMAIL) {
    return (
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: 4,
            mt: 4,
            bgcolor: 'background.default',
            backgroundImage:
              'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))',
          }}
        >
          <Typography variant="h5" align="center" gutterBottom>
            Verify your email
          </Typography>

          <Alert severity="info" sx={{ mt: 3, mb: 3 }}>
            We've sent a verification email to <strong>{email}</strong>. Please
            check your inbox and click the verification link to complete your
            registration.
          </Alert>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            After verifying your email, you can log in to your account.
          </Typography>

          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={() => {
              setMode(AuthMode.SIGN_IN);
              setError(null);
              setSuccess(null);
            }}
            sx={{ mb: 2, py: 1.2 }}
          >
            Go to Log In
          </Button>

          <Button
            fullWidth
            variant="outlined"
            onClick={async () => {
              try {
                // Resend verification email through sign up again
                setLoading(true);
                await auth.signUpWithEmail(email, password);
                setSuccess('Verification email resent!');
              } catch (error: any) {
                // Ignore "already exists" errors
                if (!error.message.includes('already in use')) {
                  setError(error.message || 'Failed to resend email');
                }
              } finally {
                setLoading(false);
              }
            }}
            disabled={loading}
            sx={{ py: 1.2 }}
          >
            {loading ? (
              <CircularProgress size={24} />
            ) : (
              'Resend Verification Email'
            )}
          </Button>

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}
        </Paper>
      </Container>
    );
  }

  if (currentUser && mode === AuthMode.PROFILE) {
    return (
      <Container maxWidth="sm">
        <Paper
          elevation={0}
          sx={{
            p: 4,
            mt: 4,
            bgcolor: 'background.default',
            backgroundImage:
              'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))',
          }}
        >
          <Typography variant="h5" align="center" gutterBottom>
            My account
          </Typography>

          <UserProfile
            onSignOut={handleSignOut}
            onAccountDeleted={handleAccountDeleted}
          />

          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {success && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {success}
            </Alert>
          )}
        </Paper>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm">
      <Paper
        elevation={3}
        sx={{
          p: 4,
          mt: 4,
          bgcolor: 'background.default',
          backgroundImage:
            'linear-gradient(rgba(255, 255, 255, 0.165), rgba(255, 255, 255, 0.165))',
        }}
      >
        <Typography variant="h5" align="center" gutterBottom>
          {mode === AuthMode.SIGN_IN
            ? 'Log in to Tailrmade'
            : mode === AuthMode.SIGN_UP
              ? 'Welcome to Tailrmade'
              : 'Reset Password'}
        </Typography>

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 2 }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          {mode !== AuthMode.RESET_PASSWORD && (
            <>
              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type={showPassword ? 'text' : 'password'}
                id="password"
                autoComplete={
                  mode === AuthMode.SIGN_UP
                    ? 'new-password'
                    : 'current-password'
                }
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                slotProps={{
                  input: {
                    endAdornment: (
                      <InputAdornment position="end">
                        <IconButton
                          aria-label="toggle password visibility"
                          onClick={() => setShowPassword(!showPassword)}
                          edge="end"
                          size="small"
                        >
                          {showPassword ? (
                            <VisibilityOffIcon />
                          ) : (
                            <VisibilityIcon />
                          )}
                        </IconButton>
                      </InputAdornment>
                    ),
                  },
                }}
              />
              {mode === AuthMode.SIGN_IN && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Button
                    color="secondary"
                    onClick={() => {
                      setError(null);
                      setSuccess(null);
                      setMode(AuthMode.RESET_PASSWORD);
                    }}
                    sx={{ textTransform: 'none', fontSize: '0.875rem', p: 0.5 }}
                  >
                    Forgot password?
                  </Button>
                </Box>
              )}
            </>
          )}

          <Button
            type="submit"
            fullWidth
            variant="contained"
            color="primary"
            disabled={loading}
            sx={{ mt: 3, mb: 2, py: 1.2 }}
          >
            {loading ? (
              <CircularProgress size={24} color="inherit" />
            ) : mode === AuthMode.SIGN_IN ? (
              'Log in'
            ) : mode === AuthMode.SIGN_UP ? (
              'Create account'
            ) : (
              'Send Reset Email'
            )}
          </Button>
        </Box>

        {(mode === AuthMode.SIGN_IN || mode === AuthMode.SIGN_UP) && (
          <>
            <Divider sx={{ mb: 2 }}>or</Divider>

            <Button
              fullWidth
              variant="outlined"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleSignIn}
              disabled={loading}
              sx={{
                mb: 3,
                borderColor: 'rgba(255, 255, 255, 0.23)',
                color: 'text.primary',
                py: 1.2,
                fontSize: '1rem',
                '&:hover': {
                  borderColor: 'rgba(255, 255, 255, 0.4)',
                  backgroundColor: 'action.hover',
                },
              }}
            >
              Continue with Google
            </Button>
          </>
        )}

        {(mode === AuthMode.SIGN_IN || mode === AuthMode.SIGN_UP) && (
          <Box
            sx={{ mt: mode === AuthMode.SIGN_IN ? 2 : 3, textAlign: 'center' }}
          >
            <Button
              color="secondary"
              onClick={() => {
                setError(null);
                setSuccess(null);
                setMode(
                  mode === AuthMode.SIGN_IN
                    ? AuthMode.SIGN_UP
                    : AuthMode.SIGN_IN,
                );
              }}
              sx={{ textTransform: 'none' }}
            >
              {mode === AuthMode.SIGN_IN
                ? 'No account? Create one'
                : 'Already have an account? Log in'}
            </Button>
          </Box>
        )}

        {(mode === AuthMode.SIGN_IN || mode === AuthMode.SIGN_UP) && (
          <Typography
            variant="caption"
            color="text.secondary"
            align="center"
            component="p"
            sx={{ mt: 2 }}
          >
            By continuing, you acknowledge the{' '}
            <MuiLink
              href="/help/privacy-policy"
              target="_blank"
              rel="noopener noreferrer"
              color="secondary"
              underline="hover"
            >
              Privacy Policy
            </MuiLink>
            .
          </Typography>
        )}

        {mode === AuthMode.RESET_PASSWORD && (
          <Button
            fullWidth
            color="secondary"
            onClick={() => {
              setError(null);
              setSuccess(null);
              setMode(AuthMode.SIGN_IN);
            }}
            sx={{ mt: 3, textTransform: 'none' }}
          >
            Back to Log in
          </Button>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
        {success && (
          <Alert severity="success" sx={{ mt: 2 }}>
            {success}
          </Alert>
        )}
      </Paper>
    </Container>
  );
};

export default Authentication;
