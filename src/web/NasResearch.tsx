import {useEffect,useState} from "react";
import {Globe} from "lucide-react";
import type {NasClient,ResearchMode} from "./nas-client";
export function NasResearch({client,busy}:{client:NasClient;busy:boolean}){
  const [mode,setMode]=useState<ResearchMode|null>(null),[working,setWorking]=useState(false),[notice,setNotice]=useState("");
  useEffect(()=>{let live=true;void client.research().then(v=>{if(live)setMode(v.mode);}).catch(e=>{if(live)setNotice(String(e));});return()=>{live=false;};},[client]);
  async function save(value:ResearchMode){setWorking(true);setNotice("");try{setMode((await client.saveResearch(value)).mode);setNotice("Saved on Beholder.");}catch(e){setNotice(String(e));}finally{setWorking(false);}}
  async function test(){setWorking(true);setNotice("");try{const result=await client.testResearch();setNotice("SearXNG returned "+result.count+" results.");}catch(e){setNotice(e instanceof Error?e.message:String(e));}finally{setWorking(false);}}
  return <><div className="control-page-note"><Globe size={20}/> Search runs on Beholder, independent of your Windows PC.</div><div className="settings-section-title">Web research</div><section className="control-form-section">
    <label className="setting-field">Mode<select disabled={busy||working||mode===null} value={mode??"off"} onChange={e=>void save(e.target.value as ResearchMode)}><option value="off">Off</option><option value="simple">Simple · search previews / direct reads</option><option value="strict">Strict · additional evidence planning and source reads</option></select></label>
    <p>When enabled, a model decides whether public research is useful. Recent user messages are sent to that planner; public search queries go to SearXNG and its upstream engines. Do not use web research for private material.</p>
    <p>Strict mode may use additional cloud requests. Both modes share the provider budget. Page reading is best-effort, public HTML/text only.</p>
    <button className="secondary-action" disabled={busy||working} onClick={()=>void test()}>Test search connection</button>{notice&&<p role="status">{notice}</p>}
  </section></>;
}
