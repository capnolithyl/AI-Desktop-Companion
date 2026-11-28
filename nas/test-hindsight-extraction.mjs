// Explicit CLI, synthetic retain test or read-only inspection of a specific
// production fact. Never reads owner SQLite, changes production memory or retries.
import {randomUUID} from "node:crypto";
import {setTimeout as sleep} from "node:timers/promises";
import {createHindsightClient,ownerRetainItem} from "./hindsight.mjs";
const client=createHindsightClient({url:process.env.MIKAN_HINDSIGHT_LOCAL_URL||"http://hindsight-local:8888",key:process.env.MIKAN_HINDSIGHT_LOCAL_KEY||""});
const args=process.argv.slice(2);
if(args[0]==="inspect"){
  if(args.length<2||args.length>9||!args.slice(1).every(id=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))throw Error("Provide 1–8 exact memory UUIDs");
  for(const id of args.slice(1)){
    try{console.log(JSON.stringify({id,record:await client.getMemory("mikan-experimental-user",id)},null,2));}
    catch(e){console.error("Read failed",id,e.message);process.exitCode=1;}
  }
}else if(args.length)throw Error("Usage: no arguments for synthetic test, or inspect <memory UUID>...");
else{
  const bank="mikan-extraction-smoke-"+randomUUID();
  const content="I leave next Thursday evening and work in the office Friday. The company dinner is next Saturday, and I return Sunday morning. My partner Rowan will look after both children and our dog Pippin while I am away. I spent the past two days alone with Theo and Pippin while Rowan and our other child visited friends.";
  const item=ownerRetainItem({id:"synthetic-"+randomUUID(),content,createdAt:Date.parse("2026-11-28T00:03:31Z")});
  console.log(JSON.stringify({bank,item,expected:"Statement local Friday 2026-11-27. Travel Dec 3–6, office Dec 4, dinner Dec 5; owner previously cared for Theo and dog, Rowan will care for both children and dog. Exact past dates need not be inferred if ambiguous."},null,2));
  let confirmed=false;
  try{
    const t=Date.now(),result=await client.retain(bank,[item]);
    if(result?.success!==true||result.items_count!==undefined&&result.items_count!==1)throw Error("Retain unconfirmed");
    confirmed=true;
    console.log(JSON.stringify({retainMs:Date.now()-t,usage:result.usage??null},null,2));
    const read=async()=>{const response=await client.listMemories(bank);if(!Array.isArray(response?.items))throw Error("Unexpected memory listing format");return response.items;};
    const first=await read();
    console.log(JSON.stringify({phase:"after retain",memories:first},null,2));
    let all=first;
    const deadline=Date.now()+90000;
    while(!all.some(m=>(m.fact_type??m.type)==="observation")&&Date.now()<deadline){await sleep(5000);all=await read();}
    console.log(JSON.stringify({phase:"observation sample",observationsPresent:all.some(m=>(m.fact_type??m.type)==="observation"),memories:all,assessment:"Manual comparison required; no semantic pass asserted. Observation absence is inconclusive, and the first observation does not prove consolidation completed."},null,2));
    // Retain the isolated bank for subsequent observation inspection, without
    // accidentally deleting an active consolidation operation.
    console.log("Synthetic bank retained for inspection:",bank);
  }catch(e){console.error("Synthetic extraction test",confirmed?"read failed":"retain unconfirmed",e.message,bank);process.exitCode=1;}
}
