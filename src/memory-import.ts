/** Owner-approved import parsing; entirely local, no model calls or uploads. */
export const MEMORY_CATEGORIES = [
  {id:"profile",label:"Profile"},
  {id:"family",label:"Family & relationships"},
  {id:"work",label:"Work & career"},
  {id:"projects",label:"Projects"},
  {id:"interests",label:"Interests & hobbies"},
  {id:"preferences",label:"Preferences"},
  {id:"routines",label:"Habits & routines"},
  {id:"other",label:"Other"}
] as const;
export type MemoryCategory = typeof MEMORY_CATEGORIES[number]["id"];
export type ImportMemory = {fact:string;category:MemoryCategory;tags:string[];pinned:boolean};
const allowed = new Set<string>(MEMORY_CATEGORIES.map(category=>category.id));
export const memoryKey = (fact:string):string => fact.trim().replace(/\s+/g," ").toLocaleLowerCase();

export function suggestedCategory(text:string):MemoryCategory {
  const value=text.toLowerCase();
  if (/\b(?:born|grew up|birth(?:day|place)?|originally from|nationality|citizen|lives? in)\b/.test(value)) return "profile";
  if (/\b(?:wife|husband|spouse|married|daughter|son|children|child|kids|mother|father|parents|siblings|grandparents)\b/.test(value)) return "family";
  if (/\b(?:prefer|dislike|favorite|favourite|doesn't like|does not like|enjoys?|likes?|loves?|hates?)\b/.test(value)) return "preferences";
  if (/\b(?:work(?:s|ing)? (?:as|at|for|in)|career|job|employee|employer|profession|freelanc|developer|wordpress|salary)\b/.test(value)) return "work";
  if (/\b(?:project|building an? (?:app|site|tool)|maintains? an? (?:app|site)|developing an? app|book (?:project|draft)|novel|repository)\b/.test(value)) return "projects";
  if (/\b(?:usually|every day|daily|weekly|routine|habit|typically)\b/.test(value)) return "routines";
  if (/\b(?:music|metal|anime|manga|game|guitar|reading|history|movie|books?|coding|chess)\b/.test(value)) return "interests";
  return "other";
}
const topicMatchers:[string,RegExp][] = [
  ["wordpress",/\bwordpress\b/i],["react",/\breact(?:js)?\b/i],["typescript",/\btypescript\b/i],
  ["programming",/\b(?:coding|developer|programming)\b/i],["websites",/\b(?:websites?|web design)\b/i],
  ["music",/\b(?:music|songs?|albums?|guitar|metal)\b/i],["metal",/\bmetal\b/i],
  ["anime",/\banime\b/i],["gaming",/\b(?:games?|gaming|pokemon)\b/i],
  ["writing",/\b(?:book|novel|writing|story)\b/i],["history",/\bhistory\b/i],
  ["family",/\b(?:daughter|son|wife|husband|children|kids|spouse)\b/i]
];
export function suggestedTags(fact:string):string[] {
  return topicMatchers.filter(([,matcher])=>matcher.test(fact)).map(([tag])=>tag).slice(0,8);
}
export function parseTags(input:string|string[]|undefined):string[] {
  if(input===undefined) return [];
  const values=Array.isArray(input)?input:input.split(/[,;|]/);
  if(values.some(v=>typeof v!=="string"))throw Error("Tags must be text");
  const tags=[...new Set(values.map(tag=>tag.trim().replace(/\s+/g," ").toLowerCase()).filter(Boolean))];
  if(tags.length>8 || tags.some(tag=>[...tag].length>32 || !/^[\p{L}\p{N}_ -]+$/u.test(tag)))
    throw Error("Use up to 8 tags, each 1–32 characters (letters, numbers, spaces, - or _)");
  return tags;
}
function normalizeRow(raw:unknown,index:number):ImportMemory {
  const item:Record<string,unknown>=typeof raw==="string" ? {fact:raw} :
    raw!==null && typeof raw==="object" && !Array.isArray(raw) ? raw as Record<string,unknown> : {};
  const value=item.fact??item.content??item.text??item.memory;
  if(typeof value!=="string")throw Error("Row "+index+" needs a fact/text field");
  const fact=value.trim().replace(/\s+/g," ");
  if(!fact || [...fact].length>500)throw Error("Row "+index+" must contain 1–500 characters");
  const category=typeof item.category==="string" && item.category.trim() ?
    item.category.trim().toLowerCase() : suggestedCategory(fact);
  if(!allowed.has(category))throw Error("Row "+index+" has an unknown category: "+category);
  const provided=item.tags;
  let tags:string[];
  if(provided===undefined || provided===null || provided==="") tags=suggestedTags(fact);
  else if(typeof provided==="string" || Array.isArray(provided)) tags=parseTags(provided as string|string[]);
  else throw Error("Row "+index+" has invalid tags");
  const pin=item.pinned??item.pin??false;
  const pinned=pin===true || pin===1 || (typeof pin==="string" && /^(true|yes|1)$/i.test(pin));
  return {fact,category:category as MemoryCategory,tags,pinned};
}
function csvRows(input:string):string[][] {
  let inside=false,cell="",row:string[]=[],rows:string[][]=[];
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){
      if(inside && input[i+1]==='"'){cell+='"';i++;}
      else if(inside)inside=false;
      else if(!cell.trim())inside=true;
      else throw Error("Unexpected CSV quote");
    }else if(ch==="," && !inside){row.push(cell);cell="";}
    else if((ch==="\n" || ch==="\r") && !inside){
      row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
      row=[];cell="";if(ch==="\r" && input[i+1]==="\n")i++;
    }else cell+=ch;
  }
  if(inside)throw Error("CSV has an unfinished quoted field");
  row.push(cell);if(row.some(x=>x.trim()))rows.push(row);
  return rows;
}
export function parseMemoryImport(input:string,format:"json"|"csv"|"text"):ImportMemory[] {
  if(input.length>1_000_000)throw Error("Import text/file must be under 1 MB");
  let raw:unknown[]=[];
  if(format==="json"){
    let parsed:unknown;
    try{parsed=JSON.parse(input.replace(/^\uFEFF/,""));}
    catch{throw Error("Invalid JSON document");}
    const source=parsed && typeof parsed==="object" && !Array.isArray(parsed) ?
      (parsed as Record<string,unknown>).memories??(parsed as Record<string,unknown>).facts : null;
    const value=Array.isArray(parsed)?parsed:source;
    if(!Array.isArray(value))throw Error("JSON must be an array or contain a memories/facts array");
    raw=value;
  }else if(format==="csv"){
    const lines=csvRows(input.replace(/^\uFEFF/,""));
    const headers=(lines.shift()??[]).map(x=>x.trim().toLowerCase());
    if(!headers.some(h=>["fact","text","memory","content"].includes(h)))
      throw Error("CSV needs a fact, text, memory or content column");
    raw=lines.map((line,index)=>{
      if(line.length>headers.length)throw Error("CSV row "+(index+2)+" has too many columns");
      return Object.fromEntries(headers.map((header,i)=>[header,line[i]??""]));
    });
  }else{
    let section:MemoryCategory|null=null;
    let inCode=false;
    raw=input.split(/\r?\n/).flatMap(line=>{
      const value=line.trim();
      if(value.startsWith(String.fromCharCode(96).repeat(3))){inCode=!inCode;return [];}
      if(inCode || !value || /^<!--/.test(value))return [];
      if(/^#{1,6}\s/.test(value)){
        const name=value.replace(/^#+\s*/,"").toLowerCase();
        section=MEMORY_CATEGORIES.find(c=>c.id===name || c.label.toLowerCase()===name)?.id??null;
        return [];
      }
      return [{fact:value.replace(/^(?:[-*+]\s+|\d+[.)]\s+|\[\s*[x ]\s*\]\s*)/i,""),
        category:section??undefined}];
    });
  }
  if(!raw.length || raw.length>1000)throw Error("Import 1–1000 individual memories");
  return raw.map((item,index)=>normalizeRow(item,index+1));
}
