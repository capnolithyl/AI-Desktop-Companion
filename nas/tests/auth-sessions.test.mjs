import {test} from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {COOKIE,createSessions,readSessionCookie,clearSessionCookie,sameOriginRequest} from "../auth-sessions.mjs";

const key="test-key-not-a-real-secret-1234567890";
const token=cookie=>readSessionCookie({headers:{cookie:cookie.split(";")[0]}});

test("remembered session is secure, opaque, and survives service restart",()=>{
  const db=new DatabaseSync(":memory:");
  try{
    const sessions=createSessions(db,key);
    const cookie=sessions.issue(true);
    assert.match(cookie,/; Path=\/; Secure; HttpOnly; SameSite=Strict; Max-Age=2592000$/);
    const t=token(cookie);
    assert.equal(t.length,64);
    assert.equal(createSessions(db,key).valid(t),true);
    assert.notEqual(db.prepare("SELECT digest FROM nas_auth_sessions").get().digest,t);
    assert.equal(createSessions(db,key+"changed").valid(t),false);
    sessions.revoke(t);
    assert.equal(sessions.valid(t),false);
    assert.match(clearSessionCookie(),/Max-Age=0$/);
  }finally{db.close();}
});
test("session expiry is enforced server side, and login rotates existing token",()=>{
  const db=new DatabaseSync(":memory:");
  let at=1000;
  try{
    const sessions=createSessions(db,key,{now:()=>at});
    const a=token(sessions.issue(true));
    const sessionCookie=sessions.issue(false,a),b=token(sessionCookie);
    assert.doesNotMatch(sessionCookie,/Max-Age/);
    assert.equal(sessions.valid(a),false);
    assert.equal(sessions.valid(b),true);
    at+=43200;
    assert.equal(sessions.valid(b),false);
    const c=token(sessions.issue(true));
    at+=2592000;
    assert.equal(sessions.valid(c),false);
  }finally{db.close();}
});
test("cookie parser and request boundary reject malformed or cross-origin input",()=>{
  assert.equal(readSessionCookie({headers:{cookie:COOKIE+"=bad"}}),null);
  assert.equal(readSessionCookie({headers:{cookie:COOKIE+"="+"a".repeat(64)+"; "+COOKIE+"="+"b".repeat(64)}}),null);
  assert.equal(sameOriginRequest({headers:{}}),false);
  assert.equal(sameOriginRequest({headers:{"x-mikan-client":"workspace","sec-fetch-site":"cross-site"}}),false);
  assert.equal(sameOriginRequest({headers:{"x-mikan-client":"workspace","sec-fetch-site":"same-site"}}),false);
  assert.equal(sameOriginRequest({headers:{"x-mikan-client":"workspace","sec-fetch-site":"same-origin"}}),true);
});
