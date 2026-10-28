// Whether a UI template placement is being evaluated right now.
//
// A socket's data type is meant to describe the graph the user wired up, so it
// adapts to the data put through it. Inside a template pass that is wrong: the
// inner nodes are shared and every row pushes its own value through them, so a
// socket would end up typed by whichever row ran last. Feed a template a mix
// of strings and numbers and the type test meant to tell them apart stops
// working, because the socket carrying the value has already coerced it.
//
// A leaf module on purpose - SocketClass reads this, and anything importing
// the template nodes would close an import cycle.
let depth = 0;

export const isTemplatePassRunning = (): boolean => depth > 0;

export const beginTemplatePass = (): void => {
  depth += 1;
};

export const endTemplatePass = (): void => {
  depth = Math.max(0, depth - 1);
};
