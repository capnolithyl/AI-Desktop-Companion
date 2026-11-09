/** Source-space coordinates are physical pixels relative to ONE monitor.
 * Never use desktop-global positions or CSS pixels for saved capture regions.
 */
export type ScreenRegion={x:number;y:number;width:number;height:number};
export type RegionChoice={monitorIndex:number;region:ScreenRegion};
export type RegionPickerPreview={
  capture:{imageBase64:string;width:number;height:number;label:string};
  monitorIndex:number;
  sourceWidth:number;
  sourceHeight:number;
};

export const CAPTURE_INTERVAL_MIN=1;
export const CAPTURE_INTERVAL_MAX=20;
export const CAPTURE_INTERVAL_DEFAULT=15;
export const MIN_REGION_SIZE=48;
export const ANALYSIS_POLICY="on-message" as const;

export function captureInterval(value:unknown):number{
  if(typeof value!=="number"||!Number.isFinite(value))return CAPTURE_INTERVAL_DEFAULT;
  return Math.max(CAPTURE_INTERVAL_MIN,Math.min(CAPTURE_INTERVAL_MAX,Math.round(value)));
}

export function validScreenRegion(region:unknown,sourceWidth:number,sourceHeight:number):region is ScreenRegion{
  if(!region||typeof region!=="object")return false;
  const rect=region as ScreenRegion;
  return [rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)&&
    rect.x>=0&&rect.y>=0&&rect.width>=MIN_REGION_SIZE&&rect.height>=MIN_REGION_SIZE&&
    rect.x+rect.width<=sourceWidth&&rect.y+rect.height<=sourceHeight;
}

export function restoreRegion(value:unknown):RegionChoice|null {
  if(!value||typeof value!=="object")return null;
  const choice=value as RegionChoice;
  if(!Number.isSafeInteger(choice.monitorIndex)||choice.monitorIndex<0)return null;
  // Exact monitor bounds are validated again in Rust whenever used.
  if(!validScreenRegion(choice.region,100_000,100_000))return null;
  return {monitorIndex:choice.monitorIndex,region:{...choice.region}};
}

/** Map a drag within an image surface to the monitor's physical pixels,
 * including CSS scaling, negative drag direction, ultrawides and screen DPI.
 */
export function dragToRegion(
  a:{x:number;y:number},b:{x:number;y:number},
  viewport:{width:number;height:number},
  source:{width:number;height:number}
):ScreenRegion|null {
  if(viewport.width<=0||viewport.height<=0||source.width<=0||source.height<=0)return null;
  const clamp=(v:number,max:number)=>Math.max(0,Math.min(max,v));
  const x1=clamp(Math.floor(Math.min(a.x,b.x)/viewport.width*source.width),source.width);
  const y1=clamp(Math.floor(Math.min(a.y,b.y)/viewport.height*source.height),source.height);
  const x2=clamp(Math.ceil(Math.max(a.x,b.x)/viewport.width*source.width),source.width);
  const y2=clamp(Math.ceil(Math.max(a.y,b.y)/viewport.height*source.height),source.height);
  const result={x:x1,y:y1,width:x2-x1,height:y2-y1};
  return validScreenRegion(result,source.width,source.height)?result:null;
}
