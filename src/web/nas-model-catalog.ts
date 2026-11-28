import type {CloudProvider,ProviderEntry} from "./nas-client";
export const providerNames:Record<CloudProvider,string>={nvidia:"NVIDIA",openrouter:"OpenRouter",gemini:"Gemini",groq:"Groq",cerebras:"Cerebras",arli:"Arli AI"};
export type ModelChoice={provider:CloudProvider;model:string};
export const modelChoiceKey=(choice:ModelChoice)=>JSON.stringify([choice.provider,choice.model]);
export function readableModelName(id:string):string{
  // Presentation only: never rewrite IDs sent to providers.
  return (id.split("/").at(-1)??id).replace(/[-_]+/g," ").replace(/\s+/g," ").trim()||id;
}
const tokens=(s:string)=>s.toLowerCase().match(/[a-z0-9]+/g)??[];
export function filterModels(entries:readonly ProviderEntry[],provider:CloudProvider|"all",query:string,current?:ModelChoice):ModelChoice[]{
  const words=tokens(query);
  const choices=entries.filter(e=>provider==="all"||e.provider===provider).flatMap(e=>[...new Set(e.models)].map(model=>({provider:e.provider,model})));
  const matches=choices.filter(c=>{
    const hay=tokens(c.model+" "+providerNames[c.provider]).join(" ");
    const compact=hay.replaceAll(" ","");
    return words.every(w=>hay.includes(w))||words.length>0&&compact.includes(words.join(""));
  });
  const active=current?modelChoiceKey(current):"";
  return matches.sort((a,b)=>Number(modelChoiceKey(b)===active)-Number(modelChoiceKey(a)===active)||providerNames[a.provider].localeCompare(providerNames[b.provider])||readableModelName(a.model).localeCompare(readableModelName(b.model),undefined,{numeric:true})||a.model.localeCompare(b.model));
}
