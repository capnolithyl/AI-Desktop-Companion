/** Enable Ollama thinking only on known capable local model families.
 * Cloud providers and fast auxiliary JSON calls use their own policies.
 */
export type ReasoningMode = "fast" | "auto" | "deep";

export function shouldUseLocalThinking(mode:ReasoningMode, question:string, model:string):boolean {
  if(mode==="fast")return false;
  // Ollama may reject think:true for models without reasoning support.
  // Expand this list only after testing a model's actual capabilities.
  if(!/(?:^|\/)(?:qwen3\.5|qwen3(?:[:.-])|deepseek-r1|gpt-oss)/i.test(model))
    return false;
  if(mode==="deep")return true;
  const text=question.trim();
  if(/\b(?:reason(?:ing)?|think carefully|step.by.step|analy[sz]e|investigate|debug|diagnos[ei]|solve|calculate|prove|compare|trade.?offs?|pros and cons|chess|strategy|work through|evaluate|why does|why is)\b/i.test(text))
    return true;
  return text.length>230 && /\b(?:how|why|which|what|if|would|should)\b/i.test(text);
}
