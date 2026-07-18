// compute-worker.ts
export type ComputeMessage = {
  data: any;
  code: string;
};

export type ComputeResult = {
  result: any;
  success: boolean;
  error?: string;
  lineNumber?: number;
  columnNumber?: number;
};

export type MacroCallRequestMessage = {
  type: 'macro-call';
  jobId: string;
  macroName: string;
  macroArgs: any[];
};

export type MacroCallResponseMessage = {
  type: 'macro-response';
  success: boolean;
  result?: any;
  error?: string;
};

type MacroCaller = (macroName: string, ...macroArgs: any[]) => Promise<any>;

type PendingMacroCall = {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timer: ReturnType<typeof setTimeout>;
};

const hashedFunctions: Record<string, Function> = {};
const macroCaller = createMacroCaller();
let pendingMacroCall: undefined | PendingMacroCall = undefined;
const MACRO_CALL_TIMEOUT_MS = 15000;

function createFunctionOrFetchPrevious(code: string): Function {
  if (hashedFunctions[code] == undefined) {
    hashedFunctions[code] = new Function(
      'data',
      'macro',
      `return (${code})(data);`,
    );
  }
  return hashedFunctions[code];
}

function createMacroCaller(): MacroCaller {
  return function macroCaller(macroName: string, ...macroArgs: any[]) {
    if (typeof macroName !== 'string' || !macroName.length) {
      return Promise.reject(
        new Error('macro() expects a macro name as the first argument.'),
      );
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingMacroCall = undefined;
        reject(
          new Error(
            `macro("${macroName}") timed out after ${MACRO_CALL_TIMEOUT_MS}ms.`,
          ),
        );
      }, MACRO_CALL_TIMEOUT_MS);

      pendingMacroCall = { resolve, reject, timer };

      self.postMessage({
        type: 'macro-call',
        macroName,
        macroArgs,
      } as MacroCallRequestMessage);
    });
  };
}

function handleMacroResponse(message: MacroCallResponseMessage): void {
  const pendingCall = pendingMacroCall;
  if (!pendingCall) {
    return;
  }

  clearTimeout(pendingCall.timer);
  pendingMacroCall = undefined;

  if (message.success) {
    pendingCall.resolve(message.result);
  } else {
    pendingCall.reject(
      message.error
        ? new Error(message.error)
        : new Error('Macro execution failed.'),
    );
  }
}

function isMacroResponseMessage(
  payload: any,
): payload is MacroCallResponseMessage {
  return payload && payload.type === 'macro-response';
}

self.onmessage = async function (e: MessageEvent<any>) {
  if (isMacroResponseMessage(e.data)) {
    handleMacroResponse(e.data);
    return;
  }

  const { data, code } = e.data as ComputeMessage;
  let result: any;
  let success = true;
  let error: string | undefined;
  let lineNumber: number | undefined;
  let columnNumber: number | undefined;

  try {
    const executeCode = createFunctionOrFetchPrevious(code);
    result = await executeCode(data, macroCaller);
  } catch (err) {
    success = false;
    error = err instanceof Error ? err.message : String(err);

    if (err instanceof Error && err.stack) {
      const match = err.stack.match(/:(\d+):(\d+)/);
      if (match) {
        lineNumber = parseInt(match[1], 10);
        columnNumber = parseInt(match[2], 10);
      }
    }

    result = undefined;
  }

  try {
    self.postMessage({
      result,
      success,
      error,
      lineNumber,
      columnNumber,
    } as ComputeResult);
  } catch (postError) {
    // If postMessage fails (e.g. non-serializable return value causing
    // DataCloneError), send back an error result instead of silently hanging.
    self.postMessage({
      result: undefined,
      success: false,
      error: `Failed to serialize result: ${postError instanceof Error ? postError.message : String(postError)}`,
    } as ComputeResult);
  }
};
