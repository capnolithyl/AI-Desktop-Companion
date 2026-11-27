import {crc32} from "node:zlib";

// Native transfer schema v1; ZIP32 stored entries, bounded batches.
export function archiveDocument(item,category){
  const meta=item.metadata,date=meta.updated_at||meta.created_at;
  return {id:item.document_id,original_text:item.content,tags:["mikan-sqlite",category],chunks:[{chunk_index:0,chunk_text:item.content}],facts:[{text:item.factText??item.content,fact_type:category==="summaries"?"experience":"world",chunk_index:0,context:item.context,metadata:meta,tags:["mikan-sqlite",category],observation_scopes:"shared",...(date?{mentioned_at:date}:{})}]};
}
export function buildArchive(documents){
  if(!Array.isArray(documents)||!documents.length||documents.length>64)throw Error("Invalid archive batch");
  const files=[["manifest.json",{schema_version:1,source_bank_id:"mikan-sqlite"}]],ids=new Set();
  for(const d of documents){
    if(!/^[a-zA-Z0-9_-]{1,120}$/.test(d.id)||ids.has(d.id)||!Array.isArray(d.facts)||d.facts.length!==1)throw Error("Invalid archive document");
    ids.add(d.id);files.push(["documents/"+d.id+".json",d]);
  }
  const locals=[],central=[];let offset=0;
  for(const [name,obj] of files){
    const n=Buffer.from(name),data=Buffer.from(JSON.stringify(obj)),checksum=crc32(data),a=Buffer.alloc(30),c=Buffer.alloc(46);
    a.writeUInt32LE(0x04034b50,0);a.writeUInt16LE(20,4);a.writeUInt16LE(0x800,6);a.writeUInt16LE(0x21,12);
    a.writeUInt32LE(checksum,14);a.writeUInt32LE(data.length,18);a.writeUInt32LE(data.length,22);a.writeUInt16LE(n.length,26);
    c.writeUInt32LE(0x02014b50,0);c.writeUInt16LE(20,4);c.writeUInt16LE(20,6);c.writeUInt16LE(0x800,8);c.writeUInt16LE(0x21,14);
    c.writeUInt32LE(checksum,16);c.writeUInt32LE(data.length,20);c.writeUInt32LE(data.length,24);c.writeUInt16LE(n.length,28);c.writeUInt32LE(offset,42);
    locals.push(a,n,data);central.push(c,n);offset+=a.length+n.length+data.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  const zip=Buffer.concat([...locals,directory,end]);
  if(zip.length>1024*1024)throw Error("Archive exceeds 1 MiB limit");
  return zip;
}
