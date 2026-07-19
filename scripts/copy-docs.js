const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'docusaurus', 'build');
const destination = path.join(root, 'dist', 'help');

if (!fs.existsSync(path.join(source, 'index.html'))) {
  console.error('docusaurus/build is missing. Build the documentation first.');
  process.exit(1);
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.cpSync(source, destination, { recursive: true });
console.log(`Copied documentation to ${destination}`);
