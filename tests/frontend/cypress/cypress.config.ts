import { defineConfig } from 'cypress';
import cypressSplit from 'cypress-split';

export default defineConfig({
  video: false,
  screenshotOnRunFailure: true,
  fixturesFolder: 'tests/frontend/cypress/fixtures',
  screenshotsFolder: 'tests/frontend/cypress/screenshots',
  videosFolder: 'tests/frontend/cypress/videos',
  e2e: {
    specPattern: 'tests/frontend/cypress/e2e/**/*.cy.ts',
    supportFile: 'tests/frontend/cypress/support/e2e.ts',
    setupNodeEvents(on, config) {
      on('before:browser:launch', (browser, launchOptions) => {
        const isCI = process.env.CI || process.env.GITHUB_ACTIONS;
        if (
          (isCI || config.env.forceSoftwareGL) &&
          browser.family === 'chromium' &&
          browser.name !== 'electron'
        ) {
          launchOptions.args.push('--use-gl=angle', '--use-angle=swiftshader');
          launchOptions.args.push('--enable-webgl', '--ignore-gpu-blocklist');
        }
        return launchOptions;
      });
      cypressSplit(on, config);
      return config;
    },
    testIsolation: false,
    retries: { runMode: 1, openMode: 0 },
    numTestsKeptInMemory: 10,
  },
  defaultCommandTimeout: 15000,
});
