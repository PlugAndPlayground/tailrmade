import { QuickJSExecutor } from './QuickJSExecutor';

export type ComputeMessage = {
  data: any;
  code: string;
  timeout?: number;
};

let executor: QuickJSExecutor | undefined;
self.onmessage = async ({
  data: { code, data, timeout },
}: MessageEvent<ComputeMessage>) => {
  let response: ComputeResult;
  try {
    executor ??= await QuickJSExecutor.create();
    response = { success: true, result: executor.execute(code, data, timeout) };
  } catch (error) {
    // The parent discards failed workers, including any damaged WASM state.
    const location =
      error instanceof Error
        ? error.stack?.match(/custom-function\.js:(\d+)(?::(\d+))?/)
        : undefined;
    response = {
      success: false,
      result: undefined,
      error: error instanceof Error ? error.message : String(error),
      lineNumber: location ? Number(location[1]) : undefined,
      columnNumber: location?.[2] ? Number(location[2]) : undefined,
    };
  }
  self.postMessage(response);
};

export type ComputeResult = {
  result: any;
  success: boolean;
  error?: string;
  lineNumber?: number;
  columnNumber?: number;
};
