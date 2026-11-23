/**
 * Captured when the desktop frontend is built or the development server starts.
 * Never consult a newer Git checkout to describe an older running bundle.
 */
export type BuildInfo=Readonly<{
  version:string;
  commit:string;
  builtAt:string;
  kind:"development"|"release"|"unknown";
}>;
declare const __MIKAN_BUILD_INFO__:BuildInfo;
const fallback:BuildInfo={version:"unknown",commit:"nogit",builtAt:"unknown",kind:"unknown"};
export const BUILD_INFO:BuildInfo=typeof __MIKAN_BUILD_INFO__==="object" &&
  __MIKAN_BUILD_INFO__!==null ? __MIKAN_BUILD_INFO__ : fallback;
export function buildIdentityLabel(info:BuildInfo=BUILD_INFO):string{
  return "v"+info.version+" · "+info.commit.slice(0,12)+" · "+info.kind;
}
