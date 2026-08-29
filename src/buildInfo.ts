declare const __TM_BUILD_TIME__: string;

export const TM_BUILD_TIME = __TM_BUILD_TIME__;

export function getTMBuildLabel(): string {
  const buildDate = new Date(TM_BUILD_TIME);
  return Number.isNaN(buildDate.getTime())
    ? `TM build: ${TM_BUILD_TIME}`
    : `TM build: ${buildDate.toLocaleString()}`;
}
