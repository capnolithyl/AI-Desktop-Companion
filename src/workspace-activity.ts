import type { MemoryRecallAudit, Diagnostics } from "./debug-log";

export type WorkspaceActivityEntry = {
  id:string; kind:"memory"|"search"; title:string; detail?:string;
  lines:string[]; timestamp:number;
};
type ActivityMessage={
  id:string; role:string; createdAt:number;
  diagnostics?:Diagnostics; workspaceMemory?:MemoryRecallAudit;
  searchQuery?:string; sources?:readonly {title:string}[]; sourcesCarriedOver?:boolean;
};

/** Use actual audited retrieval and search execution, never a planner's intended query. */
export function workspaceActivity(messages:readonly ActivityMessage[]):WorkspaceActivityEntry[]{
  const entries:WorkspaceActivityEntry[]=[];
  for(const message of messages){
    if(message.role!=="assistant")continue;
    const memory=message.diagnostics?.memory??message.workspaceMemory;
    if(memory?.facts?.length){
      entries.push({id:message.id+":memory",kind:"memory",timestamp:message.createdAt,
        title:"Memory recalled",detail:memory.facts.length+" "+(memory.facts.length===1?"fact":"facts"),
        lines:memory.facts.map(f=>f.fact)});
    }
    for(const [i,lookup] of (memory?.onDemand??[]).entries()){
      const facts=new Map((lookup.facts??[]).map(f=>[f.id,f.fact]));
      entries.push({id:message.id+":lookup:"+i,kind:"memory",timestamp:message.createdAt,
        title:lookup.error?"Memory lookup failed":"Memory lookup",detail:lookup.query,
        lines:lookup.error?[lookup.error]:lookup.ids.length?lookup.ids.map(id=>facts.get(id)??"Memory #"+id):["No matching memories"]});
    }
    const trace=message.diagnostics?.toolPlan?.searchTrace;
    const queries=[...new Set([...(trace?.attemptedQueries??[]),...(message.searchQuery?[message.searchQuery]:[])].map(q=>q.trim()).filter(Boolean))];
    if(queries.length||message.sourcesCarriedOver){
      const carried=!!message.sourcesCarriedOver;
      const count=trace?.returnedResults??message.diagnostics?.toolPlan?.freshSources??message.sources?.length??0;
      entries.push({id:message.id+":web",kind:"search",timestamp:message.createdAt,
        title:carried?"Earlier web evidence reused":"Web search",
        detail:carried?"No fresh sources for this reply":count+" "+(count===1?"result":"results"),
        lines:[...queries,...(!carried?(trace?.upstreamErrors??[]):[])]});
    }
  }
  return entries.reverse().slice(0,24);
}

export type WorkspacePanel="chats"|"avatar";
export type WorkspaceWidths={chats:number;avatar:number};
const MIN={chats:160,avatar:235},MAX={chats:440,avatar:540};
const CHAT_MIN=340, DIVIDER=8;
export function clampPanelWidth(panel:WorkspacePanel,value:number):number{
  return Math.max(MIN[panel],Math.min(MAX[panel],Math.round(Number.isFinite(value)?value:MIN[panel])));
}
/** Fit saved widths to the current viewport without overwriting the user's preference. */
export function resolveWorkspaceWidths(width:number,desired:WorkspaceWidths,showChats:boolean,showAvatar:boolean):WorkspaceWidths{
  const result={chats:clampPanelWidth("chats",desired.chats),avatar:clampPanelWidth("avatar",desired.avatar)};
  const budget=Math.max(0,width-CHAT_MIN-(Number(showChats)+Number(showAvatar))*DIVIDER);
  const total=(showChats?result.chats:0)+(showAvatar?result.avatar:0);
  const excess=Math.max(0,total-budget);
  if(excess){
    const left=showChats?result.chats-MIN.chats:0,right=showAvatar?result.avatar-MIN.avatar:0;
    const room=left+right;
    if(room){
      result.chats-=Math.min(left,Math.ceil(excess*left/room));
      result.avatar-=Math.min(right,Math.ceil(excess*right/room));
    }
  }
  return result;
}
export function resizeWorkspacePanel(panel:WorkspacePanel,value:number,width:number,otherWidth:number,otherVisible:boolean):number{
  return clampPanelWidth(panel,Math.min(value,width-CHAT_MIN-DIVIDER-(otherVisible?otherWidth+DIVIDER:0)));
}
