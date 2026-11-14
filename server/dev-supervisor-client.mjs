/**
 * Relay-side, fixed-purpose supervisor client.
 * No caller-controlled URLs, commands, branch names or filesystem paths.
 * The random secret is held only in the supervisor and its managed Node relay.
 */
export function createDevSupervisorClient({
  token=process.env.MIKAN_DEV_SUPERVISOR_TOKEN,
  base="http://127.0.0.1:3849",
  transport=fetch
}={}){
  if(typeof token!=="string"||token.length<32)return null;
  async function request(method,path){
    const response=await transport(base+path,{
      method,
      headers:{"X-Mikan-Supervisor":token},
      signal:AbortSignal.timeout(5000),
      redirect:"error",
      cache:"no-store"
    });
    const payload=await response.json();
    if(!response.ok)throw new Error(String(payload.error||"Supervisor unavailable").slice(0,250));
    return payload;
  }
  return {
    status:()=>request("GET","/status"),
    check:()=>request("POST","/check"),
    apply:()=>request("POST","/apply")
  };
}
