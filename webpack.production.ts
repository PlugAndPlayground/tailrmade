// webpack.production.ts
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CompressionPlugin = require('compression-webpack-plugin');

const config = () => {
  return {
    mode: 'production',
    devtool: false,
    performance: {
      hints: false,
    },
    module: {
      rules: [],
    },
    plugins: [
      new MiniCssExtractPlugin({
        filename: '[name].[fullhash].css',
      }),
      new CompressionPlugin({
        algorithm: 'brotliCompress',
      }),
      new Dotenv({ systemvars: true }),
      new webpack.ProgressPlugin(),
      // new BundleAnalyzerPlugin(),
    ],
    optimization: {
      usedExports: true,
      minimize: true,
      minimizer: [
        new TerserPlugin({
          parallel: true,
          terserOptions: {
            mangle: true,
            toplevel: true,
            keep_classnames: true,
            keep_fnames: true,
          },
        }),
        new CssMinimizerPlugin({
          parallel: true,
          test: /\.css$/i,
          minimizerOptions: {
            preset: ['default', { discardComments: { removeAll: true } }],
          },
        }),
      ],
    },
  };
};

module.exports = config;
export {};
