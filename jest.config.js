module.exports = {
  testEnvironment: 'node',
  transform: {
    '^.+\\.[tj]sx?$': '<rootDir>/node_modules/babel-jest/build/index.js',
  },
  transformIgnorePatterns: [
    '/node_modules/(?!(uuid|color|color-string|color-convert|color-name|colors-named|colors-named-hex|pretty-bytes)/)',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/dist/',
    '<rootDir>/dist-server/',
    '<rootDir>/.claude/',
  ],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/.claude/'],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': '<rootDir>/tests/frontend/jest/styleMock.js',
    '^earcut$': '<rootDir>/node_modules/earcut/dist/earcut.dev.js',
  },
};
