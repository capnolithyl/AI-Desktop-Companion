/** Two desktop presentations with one shared Mikan conversation/voice/avatar state. */
export type CompanionUiMode = "minimal" | "default";

export function readCompanionUiMode(value:unknown):CompanionUiMode {
  return value === "default" ? "default" : "minimal";
}

/** Target logical pixel sizes; clamp the workspace to the actual monitor.
 * The old transparent overlay always returns to its exact 520×740 footprint.
 */
export function companionWindowSize(
  mode:CompanionUiMode,
  availableWidth=1920,
  availableHeight=1080
):{width:number;height:number;alwaysOnTop:boolean}{
  if(mode==="minimal") return {width:520,height:740,alwaysOnTop:true};
  const width=Math.max(760,Math.min(1460,Math.floor(availableWidth)-88));
  const height=Math.max(570,Math.min(870,Math.floor(availableHeight)-88));
  return {width,height,alwaysOnTop:false};
}
