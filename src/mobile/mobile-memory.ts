import type { UserFact, CharacterFact, CharacterCategory, AutomaticMemoryResult } from "../memory-client";
import { mobileBackend } from "./mobile-backend";

/**
 * Same record shapes as desktop Mikan's memory-client.ts, backed by
 * Android SQLite instead of the desktop Tauri/Rust commands.
 * Keep this adapter separate from the React components.
 */
export type PocketTurn = { id: string; role: "user" | "assistant"; content: string; createdAt: number };
export type PocketThread = { id: string; title: string; createdAt: number; turns: PocketTurn[] };
export type PocketSnapshot = {
  threads: PocketThread[];
  facts: UserFact[];
  canon: CharacterFact[];
};

export const pocketMemory = {
  bootstrap: (legacy: PocketSnapshot): Promise<PocketSnapshot> =>
    mobileBackend.memory("bootstrap", { legacy }),
  snapshot: (): Promise<PocketSnapshot> =>
    mobileBackend.memory("snapshot"),
  listFacts: async (): Promise<UserFact[]> =>
    (await mobileBackend.memory<{ facts: UserFact[] }>("listFacts")).facts,
  listCanon: async (): Promise<CharacterFact[]> =>
    (await mobileBackend.memory<{ canon: CharacterFact[] }>("listCanon")).canon,
  createConversation: (conversationId: string): Promise<object> =>
    mobileBackend.memory("createConversation", { conversationId }),
  saveMessage: (conversationId: string, turn: PocketTurn): Promise<object> =>
    mobileBackend.memory("saveMessage", {
      conversationId,
      message: {
        id: turn.id, role: turn.role, content: turn.content,
        createdAt: turn.createdAt, metadataJson: "{}"
      }
    }),
  deleteConversation: (conversationId: string): Promise<object> =>
    mobileBackend.memory("deleteConversation", { conversationId }),
  addFact: async (fact: string): Promise<UserFact> =>
    (await mobileBackend.memory<{ fact: UserFact }>("addFact", { fact })).fact,
  updateFact: (id: number, fact: string): Promise<object> =>
    mobileBackend.memory("updateFact", { recordId: id, fact }),
  deleteFact: (id: number): Promise<object> =>
    mobileBackend.memory("deleteFact", { recordId: id }),
  addCanon: async (category: CharacterCategory, label: string, value: string): Promise<CharacterFact> =>
    (await mobileBackend.memory<{ fact: CharacterFact }>("addCanon", { category, label, value, personaId: "mikan" })).fact,
  updateCanon: (id: number, category: CharacterCategory, label: string, value: string): Promise<object> =>
    mobileBackend.memory("updateCanon", { recordId: id, category, label, value, personaId: "mikan" }),
  deleteCanon: (id: number): Promise<object> =>
    mobileBackend.memory("deleteCanon", { recordId: id, personaId: "mikan" }),
  processTurn: (conversationId: string, userMessageId: string, assistantMessageId: string,
    captureUser: boolean, captureCharacter: boolean): Promise<AutomaticMemoryResult> =>
    mobileBackend.extractMemory({
      conversationId, userMessageId, assistantMessageId,
      captureUser, captureCharacter
    })
};
