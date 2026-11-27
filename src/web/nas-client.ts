import {importCompanionProfile,exportCompanionProfile,type CompanionProfile} from "../companion-profile";
import type {UserFact,CharacterFact,InterestItem,MemoryConversation} from "../memory-client";
import type {SessionSummary} from "../memory-budget";
export type NasChat=MemoryConversation;
export type LearningSettings={user:boolean;character:boolean;sessions?:boolean};
export type LearningStatus={
  settings:LearningSettings;queued:number;failed:number;
  lastOutcome:{saved:number;reviewQueued:number;processedAt:number;proposed?:number;validated?:number;entries:{kind:string;description:string;evidence:string;status:string}[]}|null;
  reviews:{id:number;kind:string;description:string;evidence:string;targetId:number|null;current:string|null}[];
  history:{id:number;kind:string;previous:string;replacement:string;changedAt:number}[];
};
export type LibrarySnapshot={facts:UserFact[];characterFacts:CharacterFact[];interests:InterestItem[];sessionSummaries:SessionSummary[]};
export type CloudProvider="nvidia"|"openrouter"|"gemini";
export type ResearchMode="off"|"simple"|"strict";
export type NasSource={url:string;title:string;kind:"preview"|"page"|"notion"|"cached-web";publishedDate:string|null;id?:string;syncedAt?:number;fetchedAt?:number;fromCache?:boolean;coverage?:string};
export type NasTiming={mode:ResearchMode;totalMs:number;firstTextMs:number|null;modelCalls:number;stages:{stage:string;startMs:number;elapsedMs:number;success:boolean;errorCode?:string}[];inference?:{stage:string;finishReason:string|null;outputTokens:number|null;reasoningTokens:number|null;maxTokens:number;sawDone?:boolean}[]};
export type NasInference={researchTask?:unknown;provider:CloudProvider;requestedModel:string;actualModel:string|null;outcome:"completed"|"failed";upstreamStatus?:number|null;errorCode?:string;sources?:NasSource[];timing?:NasTiming};
export type NasMessage={id:string;role:"user"|"assistant";content:string;createdAt:number;inference?:NasInference};
export type ProviderEntry={provider:CloudProvider;model:string;models:string[];configured:boolean;credentialSource:"nas"|"environment"|"missing";imageInput:"unsupported";nativeTools:"unverified"};
export type NasModels={provider:CloudProvider;model:string;historyChars:number;providers:ProviderEntry[]};
export type NasModelPatch={provider:CloudProvider;model?:string;apiKey?:string;clearKey?:boolean;select?:boolean;historyChars?:number};
export type NasFact={id:number;fact:string;category:string;updatedAt:number};
export type NasBuild={version:string;commit:string;backendHash:string|null;actualBackendHash:string};
export type UpdatePhase="checking"|"current"|"available"|"installing"|"deferred"|"updated"|"failed"|"rolled-back";
export type UpdateChannel="stable"|"preview";
export type UpdateAction="check"|"install"|"switch-stable"|"switch-preview";
export type UpdateRecord={channel?:UpdateChannel;phase:UpdatePhase;installed:string|null;available:string|null;at:number};
export type NasUpdateStatus={build:NasBuild;pending:UpdateAction|null;host:(UpdateRecord&{checkedAt:number|null;lastBackup:number|null;history:UpdateRecord[]})|null};
export type NasStatus=NasModels&{busy:boolean;build?:NasBuild};
export type LearningEvent={id:number;conversationId:string|null;assistantId:string|null;kind:"outcome"|"failed"|"queued"|"skipped"|"recall"|"search";createdAt:number;payload:{saved?:number;reviewQueued?:number;entries?:{description:string;status:string;kind:string}[];stage?:string;validated?:number;proposed?:number;reason?:string;lines?:string[];title?:string;detail?:string}};
export type HindsightSettings={mode:"sqlite"|"hindsight";capture:boolean;dreams:boolean;dailyBatches:number;dailyDreams:number};
export type HindsightStatus=HindsightSettings&{busy:boolean;lastError:string|null;lastRecallMs:number|null;lastProbe:boolean|null;queued:number;uncertain:number;batchesToday:number;dreamsToday:number;models:{id:string;name:string;content:string;lastRefreshedAt:string|null}[];runs:{kind:string;at:number;status:string;detail:unknown;modelId:string|null}[]};
export type BrainScenario={id:string;number:number;label:string;group:string;turns:number;supported:boolean};
export type BrainStep={user:string;researchTask?:unknown;answer?:string;error?:string;timing:NasTiming;actualModel:string|null;selectedMemoryIds?:number[];sources?:(NasSource&{content:string})[];events:{title:string;detail:string;lines:string[]}[]};
export type BrainSummary={memoryEngine?:"sqlite"|"hindsight";id:string;state:string;startedAt:number;finishedAt:number|null;provider:CloudProvider;model:string;mode:ResearchMode;repetitions:number;scenarioIds:string[];total:number;done:number;currentLabel:string};
export type BrainReport=BrainSummary&{cases:{id:string;label:string;number:number;repeat:number;steps:BrainStep[]}[]};
export type KnowledgePage={id:string;title:string;url:string;characters:number;syncedAt?:number;fetchedAt?:number;chunkCount?:number;lastEdited?:string};
export type KnowledgeStatus={connected:boolean;allowNotionCloud:boolean;cacheWeb:boolean;allPages:boolean;selected:string[];available:{id:string;title:string;kind:string;url:string}[];job:{state:string;done:number;title:string;error:string|null};pages:KnowledgePage[];webPages:KnowledgePage[]};
export type KnowledgeDocument={title:string;url:string;content:string;relatedPages?:{title:string;url:string}[];missingRelatedPages?:number};
export class NasRequestError extends Error {
  constructor(message:string,readonly status:number){super(message);}
}
export class NasClient {
  constructor(private readonly key:string){}
  private async request(path:string,options:RequestInit={}){
    const response=await fetch("/api/"+path,{...options,cache:"no-store",headers:{
      Authorization:"Bearer "+this.key,...(options.body?{"Content-Type":"application/json"}:{}),...options.headers}});
    if(!response.ok){const body=await response.json().catch(()=>({}));throw new NasRequestError(body.error||"NAS request failed ("+response.status+")",response.status);}
    return response;
  }
  private async json<T>(path:string,options?:RequestInit):Promise<T>{return (await this.request(path,options)).json();}
  hindsight(){return this.json<HindsightStatus>("hindsight");}
  probeHindsight(){return this.json<HindsightStatus>("hindsight/probe",{method:"POST",body:"{}"});}
  saveHindsight(settings:HindsightSettings){return this.json<HindsightStatus>("hindsight",{method:"PUT",body:JSON.stringify(settings)});}
  updates(){return this.json<NasUpdateStatus>("updates");}
  requestUpdate(action:UpdateAction){return this.json<{queued:string}>("updates",{method:"POST",body:JSON.stringify({action})});}
  brainCatalog(){return this.json<BrainScenario[]>("brain-lab/catalog");}
  brainStatus(){return this.json<{running:boolean;current:BrainReport|null;history:BrainSummary[]}>("brain-lab");}
  brainReport(id:string){return this.json<BrainReport>("brain-lab/report/"+encodeURIComponent(id));}
  startBrain(config:{provider:CloudProvider;model:string;mode:ResearchMode;scenarioIds:string[];repetitions:number;memoryEngine?:"sqlite"|"hindsight"}){return this.json<{id:string}>("brain-lab/start",{method:"POST",body:JSON.stringify(config)});}
  stopBrain(){return this.json<{running:boolean}>("brain-lab/stop",{method:"POST",body:"{}"});}
  knowledge(){return this.json<KnowledgeStatus>("knowledge");}
  knowledgeAction(action:string,args:object={}){return this.json<KnowledgeStatus>("knowledge",{method:"POST",body:JSON.stringify({action,...args})});}
  knowledgeDocument(kind:"notion"|"web",id:string){return this.json<KnowledgeDocument>("knowledge/document?"+new URLSearchParams({kind,id}));}
  research(){return this.json<{mode:ResearchMode}>("research");}
  saveResearch(mode:ResearchMode){return this.json<{mode:ResearchMode}>("research",{method:"PUT",body:JSON.stringify({mode})});}
  testResearch(){return this.json<{ok:boolean;count:number}>("research/test",{method:"POST",body:"{}"});}
  models(){return this.json<NasModels>("models");}
  saveModels(patch:NasModelPatch){return this.json<NasModels>("models",{method:"PUT",body:JSON.stringify(patch)});}
  status(){return this.json<NasStatus>("status");}
  async profile(){return importCompanionProfile(await this.json<unknown>("profile"));}
  async saveProfile(profile:CompanionProfile){return importCompanionProfile(await this.json<unknown>("profile",{method:"PUT",body:JSON.stringify(exportCompanionProfile(profile))}));}
  async chats(){return (await this.json<{conversations:NasChat[]}>("conversations")).conversations;}
  createChat(){return this.json<NasChat>("conversations",{method:"POST",body:"{}"});}
  async messages(id:string){return (await this.json<{messages:NasMessage[]}>("conversations/"+encodeURIComponent(id)+"/messages")).messages;}
  async facts(){return (await this.json<{memories:NasFact[]}>("memories")).memories;}
  addFact(fact:string){return this.json("memories",{method:"POST",body:JSON.stringify({fact})});}
  removeFact(id:number){return this.json("memories/"+id,{method:"DELETE"});}
  learningEvents(after?:number){return this.json<{cursor:number;items:LearningEvent[]}>("learning/events"+(after===undefined?"":"?after="+after));}
  learningDiagnostics(id:string){return this.json<{events:LearningEvent[]}>("learning/diagnostics/"+encodeURIComponent(id));}
  learning(){return this.json<LearningStatus>("learning");}
  saveLearning(settings:LearningSettings){return this.json<LearningSettings>("learning",{method:"PUT",body:JSON.stringify(settings)});}
  retryLearning(){return this.json<{count:number}>("learning/retry",{method:"POST",body:"{}"});}
  resolveLearning(id:number,action:"accept"|"dismiss"){return this.json("learning/review",{method:"POST",body:JSON.stringify({id,action})});}
  library(){return this.json<LibrarySnapshot>("library");}
  memoryAction<T=unknown>(action:string,args:object){return this.json<T>("library",{method:"POST",body:JSON.stringify({action,args})});}
  async chat(id:string,text:string,onDelta:(text:string)=>void){
    const response=await this.request("chat",{method:"POST",body:JSON.stringify({conversationId:id,text})});
    if(!response.body)throw new Error("No response stream");
    const reader=response.body.getReader(),decoder=new TextDecoder();
    let buffer="",complete=false;
    function event(packet:string){
      const lines=packet.split("\n"),kind=lines.find(line=>line.startsWith("event:"))?.slice(6).trim();
      const payload=lines.find(line=>line.startsWith("data:"))?.slice(5).trim();
      if(!payload)return;
      const data=JSON.parse(payload);
      if(kind==="delta"&&typeof data.text==="string")onDelta(data.text);
      if(kind==="error")throw new Error(data.error||"Model failed");
      if(kind==="done")complete=true;
    }
    try{
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        let at;while((at=buffer.indexOf("\n\n"))>=0){event(buffer.slice(0,at));buffer=buffer.slice(at+2);}
      }
      if(buffer.trim())event(buffer);
      if(!complete)throw new Error("Reply interrupted; reopen the conversation to check its saved state");
    }finally{reader.releaseLock();}
  }
}
