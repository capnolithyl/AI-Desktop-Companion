/** Ollama thinking is a resource policy, not a keyword/topic classifier.
 * Auto accepts a semantic "replyEffort" hint from Mikan's existing local
 * tool planner. The fallback is intentionally conservative when unavailable.
 */
export type ReasoningMode = "fast" | "auto" | "deep";
export type ReplyEffort = "quick" | "deliberate";
export type LocalThinkingChoice = {
  enabled:boolean;
  reason:"fast-mode"|"deep-mode"|"unsupported-model"|"planner-quick"|
    "planner-deliberate"|"explicit-task"|"complex-question"|"conservative-fallback";
};
const deliberateActions=new Set([
  "analyze","analyse","compare","debug","diagnose","evaluate",
  "calculate","solve","prove","investigate","design"
]);
function explicitProblemTask(text:string):boolean{
  const words=(text.toLowerCase().match(/[\p{L}]+/gu)??[]).slice(0,9);
  let pos=0;
  if(words[pos]==="please")pos++;
  if(["can","could","would"].includes(words[pos]??"") && words[pos+1]==="you")pos+=2;
  if(words[pos]==="help" && words[pos+1]==="me")pos+=2;
  return deliberateActions.has(words[pos]??"");
}
export function localThinkingChoice(
  mode:ReasoningMode,question:string,model:string,plannerEffort?:ReplyEffort
):LocalThinkingChoice {
  if(mode==="fast")return {enabled:false,reason:"fast-mode"};
  if(!/(?:^|\/)(?:qwen3\.5|qwen3(?:[:.-])|deepseek-r1|gpt-oss)/i.test(model))
    return {enabled:false,reason:"unsupported-model"};
  if(mode==="deep")return {enabled:true,reason:"deep-mode"};
  if(plannerEffort==="quick")return {enabled:false,reason:"planner-quick"};
  if(plannerEffort==="deliberate")return {enabled:true,reason:"planner-deliberate"};
  const text=question.trim();
  if(explicitProblemTask(text))return {enabled:true,reason:"explicit-task"};
  if(text.length>170 && text.includes("?"))
    return {enabled:true,reason:"complex-question"};
  return {enabled:false,reason:"conservative-fallback"};
}
export function shouldUseLocalThinking(
  mode:ReasoningMode,question:string,model:string,plannerEffort?:ReplyEffort
):boolean {
  return localThinkingChoice(mode,question,model,plannerEffort).enabled;
}
