import type {NasTiming as Timing} from "./nas-client";
export function NasTiming({timing}:{timing:Timing}){
  const seconds=(n:number)=>(n/1000).toFixed(2)+"s";
  const labels:Record<string,string>={context:"Memory & prompt",planner:"Research planner",search:"SearXNG",read:"Page read",answer:"Answer model"};
  return <details className="control-form-section"><summary>Timing: {seconds(timing.totalMs)} · {timing.modelCalls} model calls{timing.firstTextMs!==null?" · first text "+seconds(timing.firstTextMs):""}</summary>
    {timing.stages.map((s,i)=><div key={i}><small>{labels[s.stage]??s.stage}: {seconds(s.elapsedMs)} {s.success?"":"(failed)"}</small><progress max={Math.max(1,timing.totalMs)} value={s.elapsedMs} style={{display:"block",width:"100%"}}/></div>)}
    <p className="settings-note">Server wall time through generation; excludes persistence, UI transport and later memory extraction. Provider reasoning and network time are included in model calls.</p>
  </details>;
}
