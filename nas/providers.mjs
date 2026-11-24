// Cloud-only provider adapter. Credentials remain on the NAS, never in browser responses.
export function providerConfig(env = process.env) {
  const provider = (env.MIKAN_PROVIDER || "nvidia").toLowerCase();
  if (!["nvidia","openrouter","gemini"].includes(provider)) throw new Error("Unsupported MIKAN_PROVIDER");
  const defaults = {
    nvidia:"nvidia/nemotron-3-ultra-550b-a55b",
    openrouter:"openrouter/free",
    gemini:"gemini-2.5-flash"
  };
  const model = (env.MIKAN_MODEL || defaults[provider]).trim();
  if (!/^[\w./:-]{2,120}$/.test(model)) throw new Error("Invalid MIKAN_MODEL");
  const key = env[{nvidia:"NVIDIA_API_KEY",openrouter:"OPENROUTER_API_KEY",gemini:"GEMINI_API_KEY"}[provider]];
  if (!key || key.length < 12) throw new Error("Configure the selected provider API key in nas/.env");
  return { provider, model, key };
}
function remoteError(status) {
  return Object.assign(new Error("Cloud model request failed ("+status+")"),{upstreamStatus:status});
}
export async function generateReply({config, system, history, onDelta, onModel=()=>{}, fetchImpl=fetch, temperature=0.7, maxTokens=1400}) {
  const {provider,model,key} = config;
  if (provider === "gemini") {
    const contents = history.map(m=>({
      role:m.role==="assistant"?"model":"user", parts:[{text:m.content}]
    }));
    const response = await fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",
      {method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,
          generationConfig:{maxOutputTokens:maxTokens,temperature}}),
        signal:AbortSignal.timeout(120000)}
    );
    const raw = await response.text();
    if (!response.ok) throw remoteError(response.status);
    const json = JSON.parse(raw);
    if(typeof json.modelVersion==="string"&&json.modelVersion.length<=160&&/^[\w./:-]+$/.test(json.modelVersion)&&!json.modelVersion.includes(key))onModel(json.modelVersion);
    const result = (json.candidates?.[0]?.content?.parts||[])
      .map(part=>part.text||"").join("").trim();
    if (!result) throw new Error("Cloud model returned an empty answer");
    onDelta(result);
    return result;
  }

  const url = provider==="nvidia"
    ? "https://integrate.api.nvidia.com/v1/chat/completions"
    : "https://openrouter.ai/api/v1/chat/completions";
  const response = await fetchImpl(url,{
    method:"POST",
    headers:{"Authorization":"Bearer "+key,"Content-Type":"application/json",
      ...(provider==="openrouter"?{"HTTP-Referer":"https://github.com/capnolithyl/AI-Desktop-Companion","X-Title":"Mikan NAS"}:{})},
    body:JSON.stringify({model,stream:true,max_tokens:maxTokens,temperature,
      messages:[{role:"system",content:system},...history.map(m=>({role:m.role,content:m.content}))]}),
    signal:AbortSignal.timeout(120000)
  });
  if (!response.ok) throw remoteError(response.status);
  if (!response.body) throw new Error("Provider did not return a response stream");

  const decoder = new TextDecoder();
  let buffer = "", result = "";
  const readLine = line => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data || data==="[DONE]") return;
    let event;
    try {event=JSON.parse(data);}catch{return;}
    if (event.error) throw Object.assign(new Error("Provider rejected the stream"),{upstreamStatus:Number(event.error.code)===429?429:undefined});
    if(typeof event.model==="string"&&event.model.length<=160&&/^[\w./:-]+$/.test(event.model)&&!event.model.includes(key))onModel(event.model);
    const delta=event.choices?.[0]?.delta?.content;
    const text = typeof delta==="string" ? delta :
      Array.isArray(delta) ? delta.filter(x=>x.type==="text").map(x=>x.text||"").join("") : "";
    if (text) {
      result += text;
      if (result.length > 60000) throw new Error("Reply exceeded length limit");
      onDelta(text);
    }
  };
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk,{stream:true});
    if (buffer.length > 2_000_000) throw new Error("Provider stream too large");
    let cut;
    while ((cut=buffer.indexOf("\n"))!==-1) {
      const line=buffer.slice(0,cut).trimEnd();
      buffer=buffer.slice(cut+1);
      readLine(line);
    }
  }
  if (buffer.trim()) readLine(buffer.trim());
  if (!result.trim()) throw new Error("Cloud model returned an empty answer");
  return result.trim();
}
