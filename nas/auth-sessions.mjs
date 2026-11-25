import {createHmac,randomBytes} from "node:crypto";

export const COOKIE="__Host-mikan_session";
const REMEMBER_SECONDS=30*24*60*60;
const SESSION_SECONDS=12*60*60;
const VALID_TOKEN=/^[a-f0-9]{64}$/;

// A non-simple header cannot be sent by a cross-origin HTML form. The NAS
// does not grant CORS permission. Fetch Metadata is an additional browser guard.
export function sameOriginRequest(req){
  const site=req.headers["sec-fetch-site"];
  return req.headers["x-mikan-client"]==="workspace" && (!site||site==="same-origin");
}
export function readSessionCookie(req){
  const matches=(req.headers.cookie||"").split(";").map(part=>part.trim())
    .filter(part=>part.startsWith(COOKIE+"="));
  if(matches.length!==1)return null;
  const token=matches[0].slice(COOKIE.length+1);
  return VALID_TOKEN.test(token)?token:null;
}
function cookie(token,maxAge){
  return COOKIE+"="+token+"; Path=/; Secure; HttpOnly; SameSite=Strict"
    +(maxAge===undefined?"":"; Max-Age="+maxAge);
}
export const clearSessionCookie=()=>cookie("",0);

export function createSessions(db,key,{now=()=>Math.floor(Date.now()/1000)}={}){
  db.exec("CREATE TABLE IF NOT EXISTS nas_auth_sessions (digest TEXT PRIMARY KEY, expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL)");
  const digest=token=>createHmac("sha256",key).update("mikan-nas-session-v1:"+token).digest("hex");
  const remove=db.prepare("DELETE FROM nas_auth_sessions WHERE digest=?");
  const prune=db.prepare("DELETE FROM nas_auth_sessions WHERE expires_at<=?");
  const find=db.prepare("SELECT expires_at FROM nas_auth_sessions WHERE digest=? AND expires_at>?");
  const insert=db.prepare("INSERT INTO nas_auth_sessions(digest,expires_at,created_at) VALUES(?,?,?)");
  const cap=db.prepare("DELETE FROM nas_auth_sessions WHERE digest IN (SELECT digest FROM nas_auth_sessions ORDER BY created_at DESC,rowid DESC LIMIT -1 OFFSET 64)");
  return {
    issue(remember,previous){
      const at=now(),token=randomBytes(32).toString("hex"),ttl=remember?REMEMBER_SECONDS:SESSION_SECONDS;
      prune.run(at);
      if(previous&&VALID_TOKEN.test(previous))remove.run(digest(previous));
      insert.run(digest(token),at+ttl,at);
      cap.run();
      return cookie(token,remember?ttl:undefined);
    },
    valid(token){return typeof token==="string"&&VALID_TOKEN.test(token)&&!!find.get(digest(token),now());},
    revoke(token){if(token&&VALID_TOKEN.test(token))remove.run(digest(token));}
  };
}
