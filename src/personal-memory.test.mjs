import test from "node:test";
import assert from "node:assert/strict";
import {
  isPersonalMemoryQuestion, birthDateFromFact, ageOnDate,
  answerFromPersonalMemory, personalMemoryGuidance
} from "./personal-memory.ts";
const date = new Date("2026-11-08T01:27:00.000Z"); // November 7 in Michigan.
const facts = [
  {id:6,fact:"The user says their birthday is April 23 1992",
    updatedAt:5,createdAt:1},
  {id:7,fact:"The user is a WordPress developer",
    updatedAt:7,createdAt:2},
  {id:8,fact:"The user builds websites for churches and schools",
    updatedAt:8,createdAt:3}
];

test("personal knowledge queries remain local instead of hitting Tavily", () => {
  for(const q of [
    "How old am I?", "What's my age?", "What is my favorite ice cream?",
    "Where do I work?", "What do you know about me?",
    "Who am I?", "What did I tell you about my work?",
    "How old is my son?", "Do you remember my birthday?"
  ]) assert.equal(isPersonalMemoryQuestion(q),true,q);
});

test("public or unrelated requests are not mistaken for personal memories", () => {
  for(const q of [
    "How old is the universe?", "Where can I find restaurants?",
    "What's the latest news about Maximum the Hormone?",
    "What's the release date of my favorite band's new album?",
    "What can you tell me about the history of Detroit?",
    "Search the web for my name",
    "Tell me more about the new album"
  ]) assert.equal(isPersonalMemoryQuestion(q),false,q);
});

test("uses saved birthday in SQLite and device-local date rather than UTC date", () => {
  assert.equal(answerFromPersonalMemory("How old am I?", facts, date, "America/Detroit"),
    "You're 34 years old.");
  const beforeBirthday = new Date("2026-04-23T01:30:00.000Z"); // Apr 22 Detroit
  assert.equal(answerFromPersonalMemory("How old am I?", facts, beforeBirthday, "America/Detroit"),
    "You're 33 years old.");
  const onBirthday = new Date("2026-04-23T20:00:00.000Z");
  assert.equal(answerFromPersonalMemory("How old am I?", facts, onBirthday, "America/Detroit"),
    "You're 34 years old.");
  assert.equal(answerFromPersonalMemory("How old am I?", facts, onBirthday, "America/Los_Angeles"),
    "You're 34 years old.");
});

test("parses natural and ISO birth dates but not random album or employment dates", () => {
  assert.deepEqual(birthDateFromFact("The user says their birthday is April 23 1992"),
    {year:1992,month:4,day:23});
  assert.deepEqual(birthDateFromFact("The user's date of birth is 1992-04-23"),
    {year:1992,month:4,day:23});
  assert.deepEqual(birthDateFromFact("The user was born on 23 April 1992"),
    {year:1992,month:4,day:23});
  assert.equal(birthDateFromFact("The user enjoyed the 2013 album released on July 31, 2013"),null);
  assert.equal(birthDateFromFact("The user's birthday is February 30, 1992"),null);
  assert.equal(birthDateFromFact("The user's birthday is April 23"),null);
});

test("missing memories never trigger web search or a guessed age", () => {
  assert.match(answerFromPersonalMemory("How old am I?", facts.slice(1), date, "America/Detroit") ?? "",
    /don't have your full date of birth/);
  assert.equal(answerFromPersonalMemory("Where do I work?",facts,date,"America/Detroit"),null);
  assert.match(personalMemoryGuidance("Where do I work?"),/saved SQLite facts/);
  assert.equal(personalMemoryGuidance("What's new with NASA?"),"");
});

test("handles leap years and rejects future birthdates", () => {
  const leap={year:2000,month:2,day:29};
  assert.equal(ageOnDate(leap,new Date("2026-02-28T12:00:00Z"),"UTC"),25);
  assert.equal(ageOnDate(leap,new Date("2026-03-01T12:00:00Z"),"UTC"),26);
  assert.equal(ageOnDate({year:2030,month:1,day:1},date,"UTC"),null);
});
