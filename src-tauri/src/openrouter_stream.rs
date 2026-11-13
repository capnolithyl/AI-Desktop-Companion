//! Small OpenRouter chat-completions SSE decoder, preserving text/tool boundaries.
use serde_json::{json, Value};
use std::collections::BTreeMap;

#[derive(Default)]
pub(crate) struct SseDecoder {
    pending: Vec<u8>,
    lines: Vec<String>,
}
impl SseDecoder {
    pub(crate) fn push(&mut self, bytes: &[u8]) -> Result<Vec<String>, String> {
        self.pending.extend_from_slice(bytes);
        if self.pending.len() > 2_000_000 { return Err("OpenRouter SSE event exceeded 2 MB".into()); }
        let mut events=Vec::new();
        while let Some(index)=self.pending.iter().position(|byte|*byte==b'\n') {
            let mut raw:Vec<u8>=self.pending.drain(..=index).collect();
            raw.pop();
            if raw.last()==Some(&b'\r'){raw.pop();}
            let line=String::from_utf8(raw).map_err(|_|"OpenRouter sent invalid UTF-8")?;
            if line.is_empty() {
                if !self.lines.is_empty(){events.push(self.lines.join("\n"));self.lines.clear();}
            } else if let Some(data)=line.strip_prefix("data:") {
                self.lines.push(data.strip_prefix(' ').unwrap_or(data).to_owned());
            }
        }
        Ok(events)
    }
    pub(crate) fn finish(&mut self)->Result<Vec<String>,String>{
        let mut events=self.push(b"\n\n")?;
        if !self.lines.is_empty(){events.push(self.lines.join("\n"));self.lines.clear();}
        Ok(events)
    }
}
#[derive(Default)]
struct ToolCall {
    id:String, name:String, arguments:String, kind:String
}
#[derive(Default)]
pub(crate) struct CompletionAssembler {
    content:String,
    tools:BTreeMap<usize,ToolCall>,
    reasoning_details:Vec<Value>,
    model:Option<String>,
    finish_reason:Option<String>,
    usage:Value,
}
impl CompletionAssembler {
    /// Returns visible assistant text only, never reasoning or tool arguments.
    pub(crate) fn consume(&mut self,event:&Value)->Result<Option<String>,String>{
        if let Some(model)=event["model"].as_str(){self.model=Some(model.to_owned());}
        if !event["usage"].is_null(){self.usage=event["usage"].clone();}
        if let Some(error)=event["error"].as_object(){
            let reason=error.get("message").and_then(Value::as_str).unwrap_or("Provider interrupted stream");
            let code=error.get("code").map(|x|x.to_string()).unwrap_or_else(||"unknown".into());
            return Err(format!("OpenRouter stream error {code}: {}",reason.chars().take(220).collect::<String>()));
        }
        let choice=&event["choices"][0];
        if let Some(reason)=choice["finish_reason"].as_str(){self.finish_reason=Some(reason.to_owned());}
        let delta=&choice["delta"];
        let mut text=None;
        if let Some(part)=delta["content"].as_str(){
            if !part.is_empty(){self.content.push_str(part);text=Some(part.to_owned());}
        } else if let Some(parts)=delta["content"].as_array(){
            let part=parts.iter().filter_map(|p|p["text"].as_str()).collect::<Vec<_>>().join("");
            if !part.is_empty(){self.content.push_str(&part);text=Some(part);}
        }
        if let Some(details)=delta["reasoning_details"].as_array(){
            self.reasoning_details.extend(details.iter().cloned());
        }
        if let Some(calls)=delta["tool_calls"].as_array(){
            for item in calls{
                let index=item["index"].as_u64().unwrap_or(0) as usize;
                if index>16{return Err("OpenRouter emitted too many tool calls".into());}
                let tool=self.tools.entry(index).or_default();
                if let Some(id)=item["id"].as_str(){tool.id.push_str(id);}
                if let Some(name)=item["function"]["name"].as_str(){tool.name.push_str(name);}
                if let Some(args)=item["function"]["arguments"].as_str(){
                    if tool.arguments.len()+args.len()>24_000{return Err("OpenRouter tool arguments exceeded 24 KB".into());}
                    tool.arguments.push_str(args);
                }
                if let Some(kind)=item["type"].as_str(){tool.kind=kind.to_owned();}
            }
        }
        Ok(text)
    }
    pub(crate) fn has_tools(&self)->bool{!self.tools.is_empty()}
    pub(crate) fn to_response(self,route:&str)->Result<Value,String>{
        let finish=self.finish_reason.as_deref().unwrap_or("missing");
        if finish=="missing"||finish=="error"{return Err(format!("OpenRouter stream incomplete: {finish}"));}
        let calls=self.tools.into_values().map(|call|json!({
            "id":call.id,
            "type":if call.kind.is_empty(){"function"}else{&call.kind},
            "function":{"name":call.name,"arguments":call.arguments}
        })).collect::<Vec<_>>();
        let mut message=json!({"role":"assistant","content":self.content,"tool_calls":calls});
        if !self.reasoning_details.is_empty(){message["reasoning_details"]=json!(self.reasoning_details);}
        Ok(json!({"model":self.model.as_deref().unwrap_or(route),"usage":self.usage,
            "choices":[{"message":message,"finish_reason":finish}]}))
    }
}
#[cfg(test)]
mod tests{
    use super::*;
    #[test]
    fn fragmented_unicode_and_crlf_events(){
        let data="data: {\"choices\":[{\"delta\":{\"content\":\"Mikan 🐈\"}}]}\r\n\r\n";
        let bytes=data.as_bytes();
        let cut=bytes.iter().position(|x|*x==0xF0).unwrap()+2;
        let mut parser=SseDecoder::default();
        assert!(parser.push(&bytes[..cut]).unwrap().is_empty());
        let events=parser.push(&bytes[cut..]).unwrap();
        assert_eq!(events.len(),1);
        let value:Value=serde_json::from_str(&events[0]).unwrap();
        let mut state=CompletionAssembler::default();
        assert_eq!(state.consume(&value).unwrap().as_deref(),Some("Mikan 🐈"));
        assert!(parser.push(b": keepalive\n\n").unwrap().is_empty());
    }
    #[test]
    fn streams_tool_calls_without_leaking_arguments_as_text(){
        let mut state=CompletionAssembler::default();
        let a=json!({"model":"test:free","choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","type":"function","function":{"name":"search_web","arguments":"{\"query\":"}}]}}]});
        let b=json!({"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"music news\"}"}}]},"finish_reason":"tool_calls"}],"usage":{"completion_tokens":19}});
        assert_eq!(state.consume(&a).unwrap(),None);
        assert_eq!(state.consume(&b).unwrap(),None);
        assert!(state.has_tools());
        let value=state.to_response("openrouter/free").unwrap();
        assert_eq!(value["choices"][0]["message"]["tool_calls"][0]["function"]["arguments"],"{\"query\":\"music news\"}");
        assert_eq!(value["usage"]["completion_tokens"],19);
    }
    #[test]
    fn visible_text_excludes_reasoning_and_duplicate_usage_chunk(){
        let mut state=CompletionAssembler::default();
        assert_eq!(state.consume(&json!({"choices":[{"delta":{"reasoning":"hidden"}}]})).unwrap(),None);
        assert_eq!(state.consume(&json!({"model":"provider/free:free","choices":[{"delta":{"content":"Hello!"},"finish_reason":"stop"}]})).unwrap().as_deref(),Some("Hello!"));
        assert_eq!(state.consume(&json!({"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":9}})).unwrap(),None);
        let value=state.to_response("openrouter/free").unwrap();
        assert_eq!(value["choices"][0]["message"]["content"],"Hello!");
        assert_eq!(value["usage"]["prompt_tokens"],9);
        assert_eq!(value["model"],"provider/free:free");
    }
    #[test]
    fn error_and_missing_finish_fail_closed(){
        assert!(CompletionAssembler::default().to_response("openrouter/free").is_err());
        let mut state=CompletionAssembler::default();
        assert!(state.consume(&json!({"error":{"code":429,"message":"Rate limit"},"choices":[{"delta":{},"finish_reason":"error"}]})).unwrap_err().contains("429"));
    }
}
