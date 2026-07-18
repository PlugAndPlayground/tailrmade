import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { SnackbarProvider } from 'notistack';
import { customTheme } from './utils/constants';
import { isPhone } from './utils/utils';
import App from './App';
import './utils/global.css';

const reactElement = document.createElement('div');
const container = document.body.appendChild(reactElement);
const root = createRoot(container!);
container.className = 'rootClass';
container.id = 'container';
const Main = () => {
  useEffect(() => {
    // Remove the initial loader
    const loader = document.getElementById('initial-loader');
    if (loader) {
      loader.remove();
    }
  }, []);

  return (
    <ThemeProvider theme={customTheme}>
      <CssBaseline />
      <SnackbarProvider
        maxSnack={9}
        dense={isPhone()}
        anchorOrigin={{
          horizontal: isPhone() ? 'center' : 'right',
          vertical: 'bottom',
        }}
        autoHideDuration={3000}
      >
        <App />
      </SnackbarProvider>
    </ThemeProvider>
  );
};

root.render(<Main />);
