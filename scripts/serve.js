const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const dist = path.resolve(__dirname, '..', 'dist');
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || '0.0.0.0';

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.fnt': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
};

function safeFilePath(requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0]);
  const relative = decoded.replace(/^[/\\]+/, '');
  const candidate = path.resolve(dist, relative || 'index.html');
  return candidate.startsWith(`${dist}${path.sep}`) ? candidate : null;
}

function sendFile(response, filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const immutable = /\.[0-9a-f]{20}\./.test(path.basename(filePath));
  response.writeHead(200, {
    'Cache-Control': immutable
      ? 'public, max-age=31536000, immutable'
      : filePath.endsWith('index.html')
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=3600',
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
  });
  fs.createReadStream(filePath).pipe(response);
}

const server = http.createServer((request, response) => {
  if ((request.url || '').split('?')[0] === '/buildInfo') {
    response.writeHead(200, {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Content-Type': 'application/json; charset=utf-8',
    });
    response.end(
      JSON.stringify({
        buildVersion: process.env.BUILD_VERSION,
        buildTime: process.env.BUILD_TIME,
        cloudMode: false,
      }),
    );
    return;
  }

  let filePath;
  try {
    filePath = safeFilePath(request.url || '/');
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }
  if (!filePath) {
    response.writeHead(400).end('Bad request');
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (!error && stats.isFile()) {
      sendFile(response, filePath);
      return;
    }

    const indexPath = path.join(dist, 'index.html');
    fs.stat(indexPath, (indexError) => {
      if (indexError) {
        response.writeHead(404).end('Build not found. Run `yarn build` first.');
        return;
      }
      sendFile(response, indexPath);
    });
  });
});

server.listen(port, host, () => {
  console.log(`Tailrmade is available at http://${host}:${port}`);
});
