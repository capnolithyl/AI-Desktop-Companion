import test from "node:test";
import assert from "node:assert/strict";
import {
  learningCommand, learningSessionActive, questionAnswerMemory,
  contextualLearningFact
} from "./learning-memory.ts";

const history = (question, start = "Ask me anything and remember the answer") => [
  { role: "user", content: start },
  { role: "assistant", content: "Sounds fun! " + question }
];

test("learning mode requires explicit invitation and survives conversation history", () => {
  assert.equal(learningCommand("Ask me anything and remember the answer"), "start");
  assert.equal(learningCommand("I want you to learn some things about me."), "start");
  assert.equal(learningCommand("Can you remember my favorite color is orange?"), null);
  assert.equal(learningCommand("What's your favorite ice cream?"), null);
  assert.equal(learningCommand("Stop learning my answers"), "stop");
  assert.equal(learningSessionActive(history("What's your favorite color?")), true);
  assert.equal(learningSessionActive([...history("What's your favorite color?"),
    {role:"user",content:"Stop learning my answers"}]), false);
});

test("an answer acquires its subject from Mikan's question, not a first-person grammar", () => {
  const cheddar = contextualLearningFact("Oh okay probably Swiss", history(
    "Hmm, let me see... What's your favorite kind of cheese? It's crucial information, you know. 😉"
  ));
  assert.equal(cheddar?.fact, "The user's favorite kind of cheese is probably Swiss");
  const vanilla = contextualLearningFact("Vanilla for sure. I'm classy like that", [
    ...history("What's your favorite kind of cheese?"),
    { role:"user", content:"Oh okay probably Swiss" },
    { role:"assistant", content:"Swiss, huh? Classic! Now, what's your favorite flavor of ice cream? It's important, after all." }
  ]);
  assert.equal(vanilla?.fact, "The user's favorite flavor of ice cream is Vanilla");
});

test("general questions across topics preserve semantics or the exact question and response", () => {
  const examples = [
    ["Where did you grow up?", "Near Hamburg.", "The user grew up in Near Hamburg"],
    ["What do you do for work?", "Web development!", "The user works as Web development"],
    ["What's your favorite programming language?", "TypeScript", "The user's favorite programming language is TypeScript"],
    ["What kinds of books do you enjoy?", "Cosmic horror", 'When asked "What kinds of books do you enjoy?", the user answered "Cosmic horror"'],
    ["What motivates you to create things?", "I like learning new skills.", 'When asked "What motivates you to create things?", the user answered "I like learning new skills"'],
    ["Do you like strategy games?", "Yes", "The user likes strategy games"]
  ];
  for (const [question, answer, fact] of examples) {
    assert.equal(contextualLearningFact(answer, history(question))?.fact, fact, question);
  }
});

test("never infer an answer without consent, a model question, or a real user response", () => {
  assert.equal(contextualLearningFact("Vanilla", [
    {role:"user",content:"How are you?"},
    {role:"assistant",content:"What's your favorite ice cream?"}
  ]), null);
  assert.equal(contextualLearningFact("Vanilla", [
    {role:"user",content:"Ask me anything and remember the answer"},
    {role:"assistant",content:"I like ice cream."}
  ]), null);
  for (const text of ["Not sure", "I don't know", "Skip", "What about you?", "My bank account password is 1234"]) {
    assert.equal(contextualLearningFact(text, history("What's your favorite thing?")), null, text);
  }
});

test("explicit remember can resolve a recent answer without an active learning session", () => {
  const turns = [
    { role:"user", content:"Tell me about your day" },
    { role:"assistant", content:"What's your favorite movie?" }
  ];
  assert.equal(contextualLearningFact("Alien", turns), null);
  assert.equal(questionAnswerMemory("Alien", turns)?.fact, "The user's favorite movie is Alien");
});
