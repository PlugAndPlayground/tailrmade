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
      // Cypress 16: CYPRESS_* vars only populate config.env, so copy the
      // non-sensitive ones the specs read via Cypress.expose()
      for (const key of [
        'cpuThrottleRate',
        'pnpTimeout',
        'pnpBaseUrl',
        'inventoryOut',
        'TEST_EMAIL',
      ]) {
        if (config.env[key] !== undefined) {
          config.expose[key] = config.env[key];
        }
      }
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
  // Cypress 16 defaults to the 'modern' checkVisibility() strategy, which
  // treats elements clipped by a zero-width overflow:hidden parent (e.g. the
  // closed dashboard column) as visible. 'legacy' is deprecated; drop it once
  // those assertions check the column state instead of :visible.
  visibilityStrategy: 'legacy',
  // Cypress 16 lowered the default from 10 to 0, too fast for Lexical inputs
  keystrokeDelay: 10,
});
