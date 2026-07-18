const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';
const yarnCommand = isWindows ? 'yarn.cmd' : 'yarn';
const frontendPort = 8082;
let devServer;

function waitForServer(timeoutMs = 120_000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({
        host: '127.0.0.1',
        port: frontendPort,
      });
      const done = (ready) => {
        socket.removeAllListeners();
        socket.destroy();
        if (ready) {
          resolve();
        } else if (Date.now() - startedAt >= timeoutMs) {
          reject(
            new Error(
              `Timed out waiting for the self-hosted frontend on port ${frontendPort}`,
            ),
          );
        } else {
          setTimeout(tryConnect, 500);
        }
      };

      socket.setTimeout(500);
      socket.once('connect', () => done(true));
      socket.once('error', () => done(false));
      socket.once('timeout', () => done(false));
    };

    tryConnect();
  });
}

function stopDevServer() {
  if (devServer && !devServer.killed) {
    devServer.kill();
  }
}

async function main() {
  devServer = spawn(yarnCommand, ['dev', '--port', String(frontendPort)], {
    cwd: root,
    env: { ...process.env, CLOUD_MODE: 'false' },
    stdio: 'inherit',
    shell: isWindows,
  });

  await waitForServer();

  await new Promise((resolve, reject) => {
    const cypress = spawn(
      yarnCommand,
      [
        'cypress',
        'run',
        '--config-file',
        'tests/frontend/cypress/cypress.config.ts',
        '--spec',
        'tests/frontend/cypress/e2e/**/*.cy.ts',
        '--browser',
        'chrome',
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CLOUD_MODE: 'false',
          CYPRESS_pnpBaseUrl: `http://127.0.0.1:${frontendPort}`,
        },
        stdio: 'inherit',
        shell: isWindows,
      },
    );

    cypress.on('error', reject);
    cypress.on('exit', (code, signal) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Cypress frontend suite failed with ${signal || `exit code ${code}`}`,
          ),
        );
      }
    });
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopDevServer();
    process.exit(0);
  });
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(stopDevServer);
