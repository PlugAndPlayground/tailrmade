// webpack.config.ts
const path = require('path');
const { merge } = require('webpack-merge');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');

const title = 'Tailrmade - Your Visual App Builder';
const imageURL =
  'https://tailrmade.app/assets/PlugAndPlayground-Drawing-a-chart.jpg';
const faviconURL = './assets/favicon-32.png';
const url = 'https://tailrmade.app';
const description =
  'Create web apps visually with drag-and-drop components. See changes instantly, work with a variety of data types, and share your tailrmade apps - all in your browser. No signup required.';
const author = 'a random tailr';

const isProduction = process.env.NODE_ENV === 'production';
const packageJson = require('./package.json');
const buildTime = new Date().toISOString();

const config: import('webpack').Configuration = {
  entry: './src/index.tsx',
  devtool: isProduction ? false : 'source-map',

  experiments: {
    asyncWebAssembly: true,
    syncWebAssembly: true,
  },

  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [
        __filename,
        path.resolve(__dirname, 'babel.config.js'),
        path.resolve(__dirname, 'package.json'),
      ],
    },
    compression: 'brotli',
    name: isProduction ? 'production-cache' : 'development-cache',
    version: packageJson.version,
  },

  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.json'],
    mainFields: ['module', 'main'],
    alias: {
      'process/browser$': require.resolve('process/browser.js'),
    },

    fallback: {
      util: require.resolve('util/'),
      process: require.resolve('process/browser.js'),
      stream: false,
      buffer: false,
    },
  },

  module: {
    rules: [
      {
        exclude: [/node_modules/, /ffmpeg\.worker\.js$/],
        test: /\.(js|jsx|ts|tsx)$/,
        use: [
          {
            loader: 'thread-loader',
          },
          {
            loader: 'babel-loader',
            options: {
              cacheDirectory: true,
              cacheCompression: false,
              sourceMap: !isProduction,
            },
          },
        ],
      },
      {
        test: /\.css$/i,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
      {
        test: /\.ttf$/,
        type: 'asset/resource',
      },
      {
        test: /\.mdx?$/,
        use: ['@mdx-js/loader'],
      },
      {
        test: /\.worker\.ts$/,
        use: 'worker-loader',
        type: 'javascript/auto',
      },
    ],
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: isProduction ? '[name].[contenthash].js' : '[name].js',
    chunkFilename: isProduction
      ? '[name].[contenthash].chunk.js'
      : '[name].chunk.js',
    clean: true,
  },
  plugins: [
    new webpack.DefinePlugin({
      __TM_BUILD_TIME__: JSON.stringify(buildTime),
    }),
    new HtmlWebpackPlugin({
      title: `${title}`,
      template: 'template.html',
      filename: 'index.html',
      meta: {
        description: {
          name: 'description',
          content: `${description}`,
        },
        title: { itemprop: 'name', content: `${title}` },
        googleDescription: {
          itemprop: 'description',
          content: `${description}`,
        },
        image: { itemprop: 'image', content: `${imageURL}` },
        'og:url': { property: 'og:url', content: `${url}` },
        'og:type': { property: 'og:type', content: 'website' },
        'og:title': { property: 'og:title', content: `${title}` },
        'og:description': {
          property: 'og:description',
          content: `${description}`,
        },
        'og:image': { property: 'og:image', content: `${imageURL}` },
        'twitter:card': { name: 'twitter:card', content: 'summary' },
        'twitter:title': { name: 'twitter:title', content: `${title}` },
        'twitter:description': {
          name: 'twitter:description',
          content: `${description}`,
        },
        'twitter:image': { name: 'twitter:image', content: `${imageURL}` },
        'twitter:creator': { name: 'twitter:creator', content: `${author}` },
      },
      favicon: faviconURL,
    }),
    new webpack.ProvidePlugin({
      PIXI: 'pixi.js',
    }),
    new MiniCssExtractPlugin({
      filename: '[name].[fullhash].css',
    }),
    new MonacoWebpackPlugin({
      languages: ['json', 'javascript', 'html'],
    }),
    new CopyPlugin({
      patterns: [
        {
          from: 'assets/**',
          to: path.resolve(__dirname, 'dist'),
        },
        {
          from: 'pnp-webassembly-nodes/**',
          to: path.resolve(__dirname, 'dist'),
        },
      ],
    }),
    new webpack.ProvidePlugin({
      process: 'process/browser.js',
    }),
  ],
};

const webpackConfig = (
  env: any,
  argv: any,
): import('webpack').Configuration => {
  const mode = argv.mode || 'development';

  const envConfig = require(path.resolve(__dirname, `./webpack.${mode}.ts`))(
    env,
  );

  const mergedConfig = merge(config, envConfig, {
    devServer: {
      allowedHosts: ['localhost', '.csb.app'],
      client: {
        logging: 'info',
        overlay: {
          runtimeErrors: (error: Error) => {
            return true;
          },
        },
      },
      setupMiddlewares: (
        middlewares: import('webpack-dev-server').Middleware[],
        devServer: import('webpack-dev-server'),
      ) => {
        if (!devServer) {
          throw new Error('webpack-dev-server is not defined');
        }
        if (!devServer.app) {
          throw new Error('webpack-dev-server app is not defined');
        }

        devServer.app.get(
          '/buildInfo',
          (
            _: import('express').Request,
            response: import('express').Response,
          ) => {
            response.send({
              message: 'This is a mock response',
              data: {
                buildVersion: 'v518',
                buildTime: '2023-08-11T21:33:54Z',
              },
            });
          },
        );

        return middlewares;
      },
      proxy: process.env.BACKEND_URL
        ? [
            {
              context: [
                '/auth',
                '/storage',
                '/public',
                '/cloud-companion',
                '/buildInfo',
              ],
              target: process.env.BACKEND_URL,
              changeOrigin: true,
            },
          ]
        : [],
    },
  });

  return mergedConfig;
};

module.exports = webpackConfig;
export {};
