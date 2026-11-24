// UI notifications reflect committed server events, never model promises.
import type {LearningEvent} from "./nas-client";
export function memoryNotice(events:readonly LearningEvent[]){
  const lines=events.flatMap(e=>{
    if(e.kind==="failed")return ["Memory extraction failed ("+(e.payload.stage??"unknown")+")"];
    if(e.kind!=="outcome")return [];
    const saved=(e.payload.entries??[]).filter(x=>x.status==="saved").map(x=>"Remembered: "+x.description);
    if(e.payload.reviewQueued)saved.push(e.payload.reviewQueued+" memory suggestion(s) to review");
    return saved;
  });
  return lines.length?{message:lines.join("\n"),warning:events.some(e=>e.kind==="failed")}:null;
}
