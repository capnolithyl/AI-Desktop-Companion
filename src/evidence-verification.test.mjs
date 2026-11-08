import test from "node:test";
import assert from "node:assert/strict";
import { verifyResearchAnswer } from "./evidence-verification.ts";

const sources = [
  {title:"Maximum the Hormone discography",url:"https://example.org/discography",
    content:"Maximum the Hormone released the studio album Yoshū Fukushū on July 31, 2013."},
  {title:"Mimi Kajiru Shinuchi EP",url:"https://example.org/ep",
    content:"Maximum the Hormone's Mimi Kajiru Shinuchi is a 2015 EP with re-recorded songs."},
];
test("supports a cited release year and title when both occur in the same evidence", () => {
  const r = verifyResearchAnswer('Maximum the Hormone released "Yoshū Fukushū" as a studio album in 2013. [1]', sources);
  assert.equal(r.rejected,0);
  assert.equal(r.usable,true);
  assert.match(r.text,/2013/);
});
test("does not confuse publication date with the release year", () => {
  const result = verifyResearchAnswer('Their album "Yoshū Fukushū" released in 2021. [1]',
    [{...sources[0],publishedDate:"2021-11-30"}]);
  assert.equal(result.usable,false);
  assert.doesNotMatch(result.text,/2021/);
});
test("rejects invented album titles and release types despite plausible citation", () => {
  const fabricated = verifyResearchAnswer('Their album "Maximum the Hormone Vol. 10" came out in 2019. [1]',sources);
  assert.equal(fabricated.usable,false);
  const wrongType = verifyResearchAnswer('"Mimi Kajiru Shinuchi" is a 2015 studio album by Maximum the Hormone. [2]',sources);
  assert.equal(wrongType.usable,false);
  const wronglyCited = verifyResearchAnswer('Their latest album "Yoshū Fukushū" released in 2013. [2]',sources);
  assert.equal(wronglyCited.usable,false);
});
test("remove unsupported cited statements while preserving other supported facts", () => {
  const result = verifyResearchAnswer(
    'Maximum the Hormone released the studio album "Yoshū Fukushū" in 2013. [1]\n' +
    'They released an album titled "Maximum the Hormone Vol. 10" in 2019. [2]',sources);
  assert.equal(result.rejected,1);
  assert.equal(result.usable,true);
  assert.match(result.text,/Yoshū Fukushū/);
  assert.doesNotMatch(result.text,/Vol. 10/);
  assert.match(result.text,/left out some details/);
});
test("rejects hallucinations with fake, nonexistent, or missing citations", () => {
  for(const response of [
    'They released "Yoshū Fukushū" in 2013.',
    'They released "Yoshū Fukushū" in 2013. [20]',
    'Their 2028 album is already released. [1]'
  ]) {
    assert.equal(verifyResearchAnswer(response,sources).usable,false);
  }
});
test("no sources means no verification and does not censor casual chat", () => {
  const result=verifyResearchAnswer("Good morning! You're funny.",[]);
  assert.equal(result.text,"Good morning! You're funny.");
  assert.equal(result.usable,false);
});
