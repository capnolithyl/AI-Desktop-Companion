import type {LearningEvent} from "./nas-client";
import type {WorkspaceActivityEntry} from "../workspace-activity";

/** Render server-recorded events, never infer activities from reply prose. */
export function nasActivity(events:readonly LearningEvent[]):WorkspaceActivityEntry[]{
  const completed=new Set(events.filter(e=>e.kind==="outcome"||e.kind==="failed").map(e=>e.assistantId).filter(Boolean));
  const entries:WorkspaceActivityEntry[]=[];
  for(const e of [...events].sort((a,b)=>b.createdAt-a.createdAt||b.id-a.id)){
    const base={id:"nas-event:"+e.id,kind:"memory" as const,timestamp:e.createdAt*1000};
    const p=e.payload;
    if(e.kind==="search"){
      entries.push({...base,kind:"search",title:p.title??"Web research",detail:p.detail,lines:p.lines??[]});
    }else if(e.kind==="recall"){
      entries.push({...base,title:"Memory recalled",detail:"Context supplied to the model",lines:p.lines??[]});
    }else if(e.kind==="outcome"){
      const saved=(p.entries??[]).filter(v=>v.status==="saved").map(v=>v.description);
      const reviews=(p.entries??[]).filter(v=>v.status==="review").map(v=>v.description);
      if(p.saved)entries.push({...base,id:base.id+":saved",title:"Memory saved",detail:p.saved+" saved",lines:saved});
      if(p.reviewQueued)entries.push({...base,id:base.id+":review",title:"Memory suggestions",detail:p.reviewQueued+" awaiting review",lines:reviews});
      if(!p.saved&&!p.reviewQueued)entries.push({...base,title:"Memory checked",detail:"No new memories saved",lines:p.proposed!==undefined&&p.validated!==undefined&&p.proposed>p.validated?[p.proposed+" proposed; "+p.validated+" passed validation"]:[]});
    }else if(e.kind==="failed"){
      entries.push({...base,title:"Memory extraction failed",detail:p.stage??"Unknown stage",lines:["See Memory & chats to retry failed jobs."]});
    }else if(e.kind==="queued"&&!completed.has(e.assistantId)){
      entries.push({...base,title:"Memory check queued",detail:"Waiting for extraction",lines:[]});
    }else if(e.kind==="skipped"&&p.reason!=="learning disabled"){
      entries.push({...base,title:"Memory check skipped",detail:p.reason,lines:[]});
    }
  }
  return entries.slice(0,24);
}
