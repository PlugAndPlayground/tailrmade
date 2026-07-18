const webpack = require('webpack');
const ESLintPlugin = require('eslint-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');

type WebpackConfig = import('webpack').Configuration & {
  devServer?: {
    hot?: boolean;
    port?: number;
    historyApiFallback?: boolean;
    compress?: boolean;
    client?: {
      overlay?: boolean;
      progress?: boolean;
    };
    server?: {
      options?: {
        maxHeaderSize?: number;
      };
    };
    headers?: {
      'Access-Control-Allow-Origin'?: string;
    };
  };
};

const config = (): WebpackConfig => {
  const isFastBuild = process.env.FAST_BUILD === 'true';

  return {
    mode: 'development',
    cache: {
      type: 'filesystem',
      buildDependencies: {
        config: [__filename],
      },
    },
    devtool: isFastBuild ? 'eval-source-map' : 'inline-source-map',
    module: {},
    devServer: {
      server: {
        options: {
          maxHeaderSize: 5 * 1024 * 1024, // 5MB
        },
      },
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    },
    plugins: [
      ...(!isFastBuild ? [new ESLintPlugin({})] : []),
      new MiniCssExtractPlugin({
        filename: '[name].css',
      }),
      new webpack.HotModuleReplacementPlugin(),
      new Dotenv({
        systemvars: true,
      }),
      new webpack.ProgressPlugin(),
    ],
    optimization: isFastBuild
      ? {
          removeAvailableModules: false,
          removeEmptyChunks: false,
          splitChunks: false,
        }
      : {},
  };
};
module.exports = config;
export {};
