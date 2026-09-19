const webpack = require('webpack');
const ESLintPlugin = require('eslint-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const Dotenv = require('dotenv-webpack');
const fs = require('fs');
const path = require('path');

// Where src/services/AIConversationLog.ts posts its transcript entries. One
// JSON-lines file per agentic run, with any capture the agent looked at saved
// beside it, so a run can be replayed and judged after the fact. Dev only -
// nothing here exists in a production build.
const AI_LOG_ROUTE = '/__ai-log';
const AI_LOG_DIR = path.resolve(__dirname, 'logs', 'ai');

const readJsonBody = (req: any): Promise<any> =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk: Buffer) => {
      raw += chunk;
    });
    req.on('error', reject);
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch (error) {
        reject(error);
      }
    });
  });

const writeAILogEntry = (entry: any): void => {
  fs.mkdirSync(AI_LOG_DIR, { recursive: true });
  const runId = String(entry.runId || 'unknown').replace(/[^\w.-]/g, '');
  const { image, ...rest } = entry;
  if (typeof image === 'string' && image.length > 0) {
    // strip the data: URL wrapper the browser hands us, keep the extension
    const match = image.match(/^data:image\/(\w+);base64,(.*)$/s);
    const extension = match ? match[1] : 'png';
    const base64 = match ? match[2] : image;
    const fileName = `${runId}-${rest.seq}.${extension}`;
    fs.writeFileSync(
      path.join(AI_LOG_DIR, fileName),
      Buffer.from(base64, 'base64'),
    );
    rest.imageFile = fileName;
  }
  fs.appendFileSync(
    path.join(AI_LOG_DIR, `${runId}.jsonl`),
    `${JSON.stringify(rest)}\n`,
  );
};

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
    setupMiddlewares?: (middlewares: any[], devServer: any) => any[];
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
      setupMiddlewares: (middlewares: any[], devServer: any) => {
        devServer?.app?.post(AI_LOG_ROUTE, (req: any, res: any) => {
          void readJsonBody(req)
            .then((entry) => writeAILogEntry(entry))
            .catch((error) =>
              console.error('could not write AI log entry', error),
            )
            .finally(() => res.status(204).end());
        });
        return middlewares;
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
