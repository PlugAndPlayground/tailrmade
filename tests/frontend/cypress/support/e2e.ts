// ***********************************************************
// This example support/e2e.ts is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

// Import commands.js using ES2015 syntax:
import './commands';
import 'cypress-real-events';

const cpuThrottleRate = Number(Cypress.env('cpuThrottleRate'));
const shouldThrottleCpu =
  Number.isFinite(cpuThrottleRate) &&
  cpuThrottleRate >= 1 &&
  Cypress.isBrowser({ family: 'chromium' });

if (shouldThrottleCpu) {
  // Applied once per spec file rather than beforeEach: the CDP setting
  // persists across cy.visit() (it's a debugger-session setting, not a
  // page-level one), and re-issuing it before every test intermittently
  // reset in-page React state (e.g. it was observed closing the right-side
  // inspector drawer between tests), causing flaky failures unrelated to
  // the throttling itself.
  before(() => {
    cy.then({ log: false }, () =>
      Cypress.automation('remote:debugger:protocol', {
        command: 'Emulation.setCPUThrottlingRate',
        params: {
          rate: cpuThrottleRate,
        },
      }),
    );
  });
}

// Alternatively you can use CommonJS syntax:
// require('./commands')
