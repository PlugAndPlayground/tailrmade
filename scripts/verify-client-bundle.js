const fs = require('fs');
const path = require('path');

const distPath = path.resolve(__dirname, '..', 'dist');
const forbiddenPatterns = [
  /jsxDEV/,
  /jsx-dev-runtime/,
  /react\/jsx-dev-runtime/,
];

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return [fullPath];
  });
}

const offenders = walk(distPath).filter((filePath) => {
  if (!/\.(js|html)$/.test(filePath)) {
    return false;
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  return forbiddenPatterns.some((pattern) => pattern.test(contents));
});

if (offenders.length > 0) {
  console.error(
    `Production bundle contains React development JSX runtime references:\n${offenders.join(
      '\n',
    )}`,
  );
  process.exit(1);
}
