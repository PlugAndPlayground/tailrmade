module.exports = function (api) {
  const isDevelopment = api.env('development');
  const presets = [
    '@babel/preset-env',
    [
      '@babel/preset-react',
      { runtime: 'automatic', development: isDevelopment },
    ],
    // Babel 8 keeps imports not marked `import type` unless told otherwise;
    // without verbatimModuleSyntax we rely on the old elision behaviour
    ['@babel/preset-typescript', { onlyRemoveTypeImports: false }],
  ];

  const plugins = [
    // the polyfill plugin below would otherwise point helpers at
    // @babel/runtime-corejs3
    ['@babel/transform-runtime', { moduleName: '@babel/runtime' }],
    // replaces preset-env's removed useBuiltIns/corejs options
    [
      'babel-plugin-polyfill-corejs3',
      {
        method: 'usage-global',
        version: require('core-js/package.json').version,
      },
    ],
  ];

  return {
    presets,
    plugins,
  };
};
