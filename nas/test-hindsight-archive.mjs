// Explicit live synthetic smoke, never reads owner SQLite or production banks.
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {createHindsightClient} from "./hindsight.mjs";
import {archiveDocument,buildArchive} from "./hindsight-archive.mjs";
const client=createHindsightClient({url:process.env.MIKAN_HINDSIGHT_LOCAL_URL||"http://hindsight-local:8888",key:process.env.MIKAN_HINDSIGHT_LOCAL_KEY||""});
const bank="mikan-archive-smoke-"+randomUUID();
let complete=false;
try{
  const kind=await client.archiveSupport();
  if(!kind)throw Error("Installed server does not advertise a native archive import endpoint");
  console.log("Native archive endpoint:",kind);
  const fact="Synthetic test subject Felix collects cobalt glass marbles.";
  const doc=archiveDocument({document_id:"synthetic-archive-fact",content:fact,factText:fact,context:"Synthetic test fixture, not owner data",metadata:{source:"mikan-smoke",created_at:"2026-11-27T00:00:00Z"}},"facts");
  const started=Date.now();
  const accepted=await client.importArchive(bank,buildArchive([doc]),kind);
  if(typeof accepted.operation_id!=="string")throw Error("No asynchronous operation ID");
  console.log("Accepted synthetic archive:",accepted.operation_id);
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    const op=await client.operation(bank,accepted.operation_id);
    if(op.status==="completed"){
      const c=op.result_metadata??{};
      console.log("Completed in ms:",Date.now()-started,"documents:",c.documents_imported,"facts:",c.facts_imported);
      if(c.documents_imported!==1||c.facts_imported!==1)throw Error("Operation counts do not match one document / one fact");
      complete=true;break;
    }
    if(["failed","cancelled","not_found"].includes(op.status))throw Error("Archive operation "+op.status);
    await sleep(1500);
  }
  if(!complete)throw Error("Archive operation still unconfirmed after polling; no retry");
  const recall=await client.recall(bank,"What does Felix collect?");
  if(!recall?.results?.some(r=>r.text===fact))throw Error("Exact imported fact was not returned by recall");
  console.log("PASS: native archive indexing and exact fact recall (no retain request)");
}catch(e){console.error("Archive smoke failed:",e.message,"Synthetic bank:",bank);process.exitCode=1;}
finally{if(complete){try{await client.removeBank(bank);}catch{console.error("Synthetic cleanup not confirmed:",bank);process.exitCode=1;}}}
