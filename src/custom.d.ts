declare module '*.module.css' {
  const classes: { [key: string]: string };
  export = classes;
}

declare module '*.json' {
  const value: any;
  export default value;
}

declare module 'plotly.js-dist';

declare module '@mui/material/styles' {
  interface Theme {
    status: {
      danger: string;
    };
  }
  // allow configuration using `createTheme`
  interface ThemeOptions {
    status?: {
      danger?: string;
    };
  }
}
