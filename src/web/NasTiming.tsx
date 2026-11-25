import type {NasTiming as Timing} from "./nas-client";
export function NasTiming({timing}:{timing:Timing}){
  const seconds=(n:number)=>(n/1000).toFixed(2)+"s";
  const labels:Record<string,string>={context:"Memory & prompt",knowledge:"Reference lookup (includes planner)", "knowledge-planner":"Reference planner",planner:"Research planner",agent:"Research tool decision","agent-answer":"Research answer synthesis",search:"SearXNG",read:"Page read",answer:"Answer model"};
  return <details className="nas-timing"><summary>Timing · {seconds(timing.totalMs)} · {timing.modelCalls} model calls{timing.firstTextMs!==null?" · first text "+seconds(timing.firstTextMs):""}</summary>
    <div className="nas-timing-grid">{timing.stages.map((s,i)=><div key={i} className="nas-timing-row"><div className="nas-timing-label"><span>{labels[s.stage]??s.stage}{s.success?"":" ("+(s.errorCode??"failed")+")"}</span><strong>{seconds(s.elapsedMs)}</strong></div><progress aria-label={labels[s.stage]??s.stage} max={Math.max(1,timing.totalMs)} value={s.elapsedMs}/></div>)}</div>
    {timing.inference?.map((v,i)=><small key={i}>{v.stage} · {v.finishReason??"unknown finish"}{v.reasoningEffort?" · "+v.reasoningEffort:""}{v.inputTokens!=null?" · input "+v.inputTokens:""} · output {v.outputTokens??"?"}/{v.maxTokens} · reasoning {v.reasoningTokens??"?"}</small>)}
    <small>Server wall time through generation; excludes persistence, UI transport and later memory extraction. Provider reasoning and network time are included in model calls.</small>
  </details>;
}
