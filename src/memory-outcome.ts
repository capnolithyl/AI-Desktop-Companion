import type {MemoryJobStatus} from "./memory-client";

/** User-visible notices come from committed SQLite outcomes, not model guesses. */
export function automaticMemoryNotice(result:Pick<MemoryJobStatus,
  "userSaved"|"characterSaved"|"interestsSaved"|"interestChanges"|"reviewQueued"
>):string|null {
  const changes=result.interestChanges ?? [];
  const parts=changes.slice(0,2).map(change=>
    `Updated ${change.name}: ${change.previousStatus} → ${change.status}`);
  if(changes.length>2) parts.push(`+${changes.length-2} more interest updates`);
  const created=Math.max(0,result.interestsSaved-changes.length);
  const saved=[
    result.userSaved?`${result.userSaved} ${result.userSaved===1?"fact":"facts"} about you`:"",
    result.characterSaved?`${result.characterSaved} ${result.characterSaved===1?"detail":"details"} about Mikan`:"",
    created?`${created} new ${created===1?"interest":"interests"}`:""
  ].filter(Boolean);
  if(saved.length)parts.push(`Remembered ${saved.join(" · ")}`);
  if(result.reviewQueued)parts.push(
    `${result.reviewQueued} suggested memory ${result.reviewQueued===1?"correction":"corrections"} ready for review`
  );
  return parts.length?parts.join(" · "):null;
}
