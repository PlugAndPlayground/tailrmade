module.exports = function (api) {
  const isDevelopment = api.env('development');
  const presets = [
    [
      '@babel/preset-env',
      {
        corejs: { version: 3 },
        useBuiltIns: 'usage',
      },
    ],
    [
      '@babel/preset-react',
      { runtime: 'automatic', development: isDevelopment },
    ],
    '@babel/preset-typescript',
  ];

  const plugins = [['@babel/transform-runtime']];

  return {
    presets,
    plugins,
  };
};
