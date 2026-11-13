/** Bulk-import grammar shared by owner collections and Mikan's character canon.
 * Parsing and validation are local. Nothing gets persisted before review. */
export const INTEREST_KINDS = ["band","album","song","anime","show","movie","game","book","other"] as const;
export const INTEREST_STATUSES = ["favorite","like","dislike","interested","experienced","unknown"] as const;
export const CANON_CATEGORIES = ["favorites","likes","dislikes","hobbies","traits","other"] as const;
export type InterestKind = typeof INTEREST_KINDS[number];
export type InterestStatus = typeof INTEREST_STATUSES[number];
export type CanonCategory = typeof CANON_CATEGORIES[number];
export type IncomingInterest = {
  name: string; kind: InterestKind; status: InterestStatus;
  rating: number | null; notes: string; tags: string[];
};
export type IncomingCanon = {category:CanonCategory; label:string; value:string};

const isObject = (v: unknown): v is Record<string,unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v);
const clean = (v: string) => v.trim().replace(/\s+/g," ");
function text(value:unknown, max:number, field:string, required=false):string {
  if (typeof value!=="string" && typeof value!=="number")
    throw Error(field+" must be text");
  const result=clean(String(value));
  if ((required && !result) || [...result].length>max)
    throw Error(field+" must contain "+(required?"1–":"0–")+max+" characters");
  return result;
}
function tags(value:unknown):string[] {
  if(value==null || value==="")return [];
  const list=Array.isArray(value) ? value : typeof value==="string" ? value.split(/[,;|]/) : null;
  if(!list || list.some(x=>typeof x!=="string"))throw Error("Tags must be a list of text");
  const out=[...new Set(list.map(x=>clean(x).toLowerCase()).filter(Boolean))];
  if(out.length>8 || out.some(tag=>[...tag].length>32 || !/^[\p{L}\p{N}_ -]+$/u.test(tag)))
    throw Error("Use up to eight tags, 1–32 characters each");
  return out;
}
function cells(input:string):string[][] {
  let quoted=false,field="",line:string[]=[],rows:string[][]=[];
  for(let i=0;i<input.length;i++){
    const ch=input[i];
    if(ch==='"'){
      if(quoted && input[i+1]==='"'){field+='"';i++;}
      else if(quoted){quoted=false;}
      else if(!field.trim()){quoted=true;}
      else throw Error("Unexpected CSV quote");
    }else if(ch==="," && !quoted){line.push(field);field="";}
    else if((ch==="\r" || ch==="\n") && !quoted){
      line.push(field);if(line.some(s=>s.trim()))rows.push(line);
      line=[];field="";if(ch==="\r" && input[i+1]==="\n")i++;
    }else field+=ch;
  }
  if(quoted)throw Error("CSV has an unfinished quoted field");
  line.push(field);if(line.some(s=>s.trim()))rows.push(line);
  return rows;
}
export type ImportFormat = "json"|"csv"|"text";
export function parseBulkRows(input:string, format:ImportFormat, target:"interests"|"canon"):unknown[] {
  if(input.length>3_000_000)throw Error("File must be under 3 MB");
  let rows:unknown[];
  if(format==="json"){
    let value:unknown;
    try{value=JSON.parse(input.replace(/^\uFEFF/,""));}catch{throw Error("Invalid JSON document");}
    const v=isObject(value) ? value.interests??value.items??value.collections??
      value.canon??value.facts??value.memories : value;
    if(!Array.isArray(v))throw Error("Expected a JSON array or an object containing an array");
    rows=v;
  }else if(format==="csv"){
    const table=cells(input.replace(/^\uFEFF/,""));
    const headers=(table.shift()??[]).map(v=>v.trim().toLowerCase().replace(/\s+/g,"_"));
    if(!headers.includes(target==="canon"?"label":"name") &&
       !headers.includes(target==="canon"?"detail":"title") &&
       !(target==="interests" && headers.includes("artist")))
      throw Error(target==="canon" ? "CSV needs label and value columns" : "CSV needs name or title column");
    rows=table.map((line,index)=>{
      if(line.length>headers.length)throw Error("Row "+(index+2)+" has too many columns");
      return Object.fromEntries(headers.map((header,i)=>[header,line[i]??""]));
    });
  }else{
    rows=input.replace(/^\uFEFF/,"").split(/\r?\n/)
      .map(s=>s.trim().replace(/^(?:[-*+]\s+|\d+[.)]\s+)/,"")).filter(Boolean)
      .map(line=>target==="interests" ? {name:line} : (()=>{
        const at=line.indexOf(":");
        if(at<1)throw Error("Mikan's plain-text details need label: value on each line");
        return {label:line.slice(0,at),value:line.slice(at+1)};
      })());
  }
  if(!rows.length || rows.length>3000)throw Error("Import 1–3000 rows");
  return rows;
}
export function parseInterests(input:string,format:ImportFormat,
  defaults:{kind:InterestKind;status:InterestStatus}={kind:"other",status:"unknown"}):IncomingInterest[] {
  return parseBulkRows(input,format,"interests").map((row,index)=>{
    const obj=typeof row==="string"?{name:row}:isObject(row)?row:{};
    const name=text(obj.name??obj.title??obj.artist??obj.band,180,"Row "+(index+1)+" name",true);
    const rawKind=String(obj.kind??obj.type??obj.category??defaults.kind).trim().toLowerCase();
    const rawStatus=String(obj.status??obj.relationship??defaults.status).trim().toLowerCase();
    const kind=({bands:"band",artists:"band",artist:"band",music:"band",albums:"album",songs:"song",tracks:"song",track:"song",singles:"song",single:"song",
      "tv show":"show","tv series":"show",series:"show",movies:"movie",films:"movie",
      games:"game",books:"book"} as Record<string,string>)[rawKind]??rawKind;
    const status=({loved:"like",love:"like",liked:"like",hated:"dislike",
      watched:"experienced",played:"experienced",listened:"experienced",
      listened_to:"experienced",read:"experienced",finished:"experienced",
      "want to watch":"interested","want to play":"interested",
      "want to read":"interested"} as Record<string,string>)[rawStatus]??rawStatus;
    if(!INTEREST_KINDS.includes(kind as InterestKind))throw Error("Row "+(index+1)+" has invalid kind");
    if(!INTEREST_STATUSES.includes(status as InterestStatus))throw Error("Row "+(index+1)+" has invalid relationship");
    const rawRating=obj.rating??obj.score;
    const rating=rawRating==null || rawRating==="" ? null : Number(rawRating);
    if(rating!==null && (!Number.isFinite(rating) || rating<0 || rating>10))
      throw Error("Row "+(index+1)+" rating must be 0–10");
    return {
      name,kind:kind as InterestKind,status:status as InterestStatus,rating,
      notes:obj.notes==null || obj.notes==="" ? "" : text(obj.notes,500,"Notes"),
      tags:tags(obj.tags)
    };
  });
}
export function parseCanon(input:string,format:ImportFormat):IncomingCanon[] {
  return parseBulkRows(input,format,"canon").map((row,index)=>{
    const obj=isObject(row)?row:{};
    const category=String(obj.category??"other").trim().toLowerCase();
    if(!CANON_CATEGORIES.includes(category as CanonCategory))
      throw Error("Row "+(index+1)+" has unknown Mikan category");
    return {
      category:category as CanonCategory,
      label:text(obj.label??obj.detail??obj.name,80,"Row "+(index+1)+" label",true),
      value:text(obj.value??obj.answer??obj.description,500,"Row "+(index+1)+" value",true)
    };
  });
}
export function interestKey(item:Pick<IncomingInterest,"kind"|"name">):string {
  return item.kind+"|"+clean(item.name).toLowerCase();
}
export function canonKey(item:Pick<IncomingCanon,"label">):string {
  return clean(item.label).toLowerCase();
}
