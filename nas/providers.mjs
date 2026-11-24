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
// Do not retain reasoning prose, raw upstream errors, tool arguments or keys.
const safeReason=value=>typeof value==="string"&&/^[a-zA-Z0-9_-]{1,40}$/.test(value)?value:null;
const tokenCount=value=>Number.isSafeInteger(value)&&value>=0&&value<=10000000?value:null;
export function inferenceError(code){return Object.assign(Error(code),{code});}
export async function generateReply({config, system, history, onDelta=()=>{}, onModel=()=>{}, onUsage=()=>{}, fetchImpl=fetch, temperature=0.7, maxTokens=4096,signal,structuredTool,agentTools,agentToolChoice="auto"}) {
  const {provider,model,key} = config;
  if(agentTools&&provider!=="nvidia")throw inferenceError("agent-provider-not-supported");
  if (provider === "gemini") {
    const contents = history.map(m=>({
      role:m.role==="assistant"?"model":"user", parts:[{text:m.content}]
    }));
    const response = await fetchImpl(
      "https://generativelanguage.googleapis.com/v1beta/models/"+encodeURIComponent(model)+":generateContent",
      {method:"POST",headers:{"Content-Type":"application/json","x-goog-api-key":key},
        body:JSON.stringify({systemInstruction:{parts:[{text:system}]},contents,
          generationConfig:{maxOutputTokens:maxTokens,temperature,...(structuredTool?{responseMimeType:"application/json"}:{})}}),
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)}
    );
    const raw = await response.text();
    if (!response.ok) throw remoteError(response.status);
    const json = JSON.parse(raw);
    if(typeof json.modelVersion==="string"&&json.modelVersion.length<=160&&/^[\w./:-]+$/.test(json.modelVersion)&&!json.modelVersion.includes(key))onModel(json.modelVersion);
    const candidate=json.candidates?.[0];
    const finish=safeReason(candidate?.finishReason);
    onUsage({finishReason:finish,outputTokens:tokenCount(json.usageMetadata?.candidatesTokenCount),reasoningTokens:tokenCount(json.usageMetadata?.thoughtsTokenCount),maxTokens});
    const result = (candidate?.content?.parts||[]).filter(part=>!part.thought)
      .map(part=>part.text||"").join("").trim();
    if (!result) throw inferenceError(finish==="MAX_TOKENS"?"output-limit":"empty-output");
    if(structuredTool&&finish==="MAX_TOKENS")throw inferenceError("output-limit");
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
    body:JSON.stringify({model,stream:!structuredTool&&!agentTools,max_tokens:maxTokens,temperature,
      ...(agentTools?{tools:agentTools,tool_choice:agentToolChoice}:structuredTool?{tools:[structuredTool],tool_choice:"required"}:{stream_options:{include_usage:true}}),
      // Same model-specific evidence setting used by the desktop NVIDIA adapter.
      ...((structuredTool||agentTools)&&provider==="nvidia"&&model==="nvidia/nemotron-3-ultra-550b-a55b"?{chat_template_kwargs:{enable_thinking:false,force_nonempty_content:true}}:{}),
      messages:[{role:"system",content:system},...history.map(m=>agentTools&&m.role==="tool"?{role:"tool",tool_call_id:m.tool_call_id,content:m.content}:agentTools&&m.role==="assistant"&&m.tool_calls?{role:"assistant",content:m.content??null,tool_calls:m.tool_calls}:{role:m.role,content:m.content})]}),
    signal:signal?AbortSignal.any([signal,AbortSignal.timeout(120000)]):AbortSignal.timeout(120000)
  });
  if (!response.ok) throw remoteError(response.status);
  if(structuredTool||agentTools){
    const data=await response.json(),choice=data.choices?.[0],message=choice?.message;
    const finish=safeReason(choice?.finish_reason);
    onUsage({finishReason:finish,outputTokens:tokenCount(data.usage?.completion_tokens),reasoningTokens:tokenCount(data.usage?.completion_tokens_details?.reasoning_tokens),maxTokens});
    if(typeof data.model==="string"&&data.model.length<=160&&/^[\w./:-]+$/.test(data.model)&&!data.model.includes(key))onModel(data.model);
    if(finish==="length")throw inferenceError("output-limit");
    if(agentTools){
      const calls=Array.isArray(message?.tool_calls)?message.tool_calls:[];
      if(calls.length>6||calls.some(c=>typeof c.id!=="string"||c.id.length>200||c.type!=="function"||typeof c.function?.name!=="string"||typeof c.function?.arguments!=="string"||c.function.arguments.length>32000)||new Set(calls.map(c=>c.id)).size!==calls.length)throw inferenceError("invalid-agent-tool-call");
      const content=typeof message?.content==="string"?message.content.trim():"";
      if(!calls.length&&!content)throw inferenceError("empty-output");
      return {content,toolCalls:calls.map(c=>({id:c.id,type:"function",function:{name:c.function.name,arguments:c.function.arguments}}))};
    }
    const matching=message?.tool_calls?.filter(c=>c.function?.name===structuredTool.function.name)??[];
    if(matching.length===1&&typeof matching[0].function.arguments==="string")return matching[0].function.arguments;
    // Some OpenAI-compatible models provide JSON content instead of a tool call.
    if(!matching.length&&typeof message?.content==="string"&&message.content.trim())return message.content.trim();
    throw inferenceError("missing-structured-output");
  }
  if (!response.body) throw inferenceError("missing-stream");

  const decoder = new TextDecoder();
  let buffer = "", result = "",finishReason=null,outputTokens=null,reasoningTokens=null,sawDone=false;
  const readLine = line => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if(data==="[DONE]"){sawDone=true;return;}
    if(!data)return;
    let event;
    try {event=JSON.parse(data);}catch{return;}
    if (event.error) throw Object.assign(new Error("Provider rejected the stream"),{upstreamStatus:Number(event.error.code)===429?429:undefined});
    if(typeof event.model==="string"&&event.model.length<=160&&/^[\w./:-]+$/.test(event.model)&&!event.model.includes(key))onModel(event.model);
    finishReason=safeReason(event.choices?.[0]?.finish_reason)??finishReason;
    outputTokens=tokenCount(event.usage?.completion_tokens)??outputTokens;
    reasoningTokens=tokenCount(event.usage?.completion_tokens_details?.reasoning_tokens)??reasoningTokens;
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
  onUsage({finishReason,outputTokens,reasoningTokens,maxTokens,sawDone});
  if (!result.trim()) throw inferenceError(finishReason==="length"?"output-limit":"empty-output");
  if(!sawDone&&!finishReason)throw inferenceError("incomplete-stream");
  return result.trim();
}
