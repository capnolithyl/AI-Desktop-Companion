import type {MemoryJobStatus} from "./memory-client";

/** User-visible notices come from committed SQLite outcomes, not model guesses. */
export function automaticMemoryNotice(result:Pick<MemoryJobStatus,
  "userSaved"|"characterSaved"|"interestsSaved"|"interestChanges"|"reviewQueued"|"entries"
>):string|null {
  const entries=(result.entries??[]).filter(item=>item.description.trim());
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
  if(entries.length){
    const detail=entries.slice(0,5).map(entry=>`${entry.kind}: ${entry.description}`);
    if(entries.length>5)detail.push(`+ ${entries.length-5} more saved items`);
    // Status changes often update existing rows, so their new state may not
    // be present in the newly inserted entries.
    if(changes.length)detail.push(...changes.slice(0,2).map(change=>
      `Interest updated: ${change.name} (${change.previousStatus} → ${change.status})`));
    if(changes.length>2)detail.push(`+ ${changes.length-2} more updates`);
    if(result.reviewQueued)detail.push(
      `${result.reviewQueued} correction suggestions ready for review`);
    return detail.join("\n");
  }
  return parts.length?parts.join(" · "):null;
}
