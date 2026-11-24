/** A one-off replay input. Text only; snapshots stop BEFORE the old answer. */
export type ReplayMessage={
  id:string;role:"user"|"assistant";content:string;failed?:boolean
};
export type ReplaySnapshot={
  targetId:string;
  question:string;
  original:string;
  /** Snapshot through the relevant user message, excluding target and future. */
  prefix:{role:"user"|"assistant";content:string}[];
  /** Turns prior to the user message, for the normal instruction composer. */
  history:{role:"user"|"assistant";content:string;failed?:boolean}[];
};
export function snapshotForReplay(
  messages:readonly ReplayMessage[],targetId:string
):ReplaySnapshot|null {
  const index=messages.findIndex(message=>message.id===targetId);
  if(index<1 || messages[index].role!=="assistant")return null;
  const earlier=messages.slice(0,index).filter(message=>message.content.trim());
  const latest=earlier.at(-1);
  // Only replay complete user-to-assistant exchanges; an assistant-only
  // system greeting or missing user question cannot be reconstructed safely.
  if(!latest || latest.role!=="user")return null;
  return {
    targetId,question:latest.content,original:messages[index].content,
    prefix:earlier.map(({role,content})=>({role,content})),
    history:earlier.slice(0,-1).map(({role,content,failed})=>({role,content,failed}))
  };
}
