import { useEffect, useState } from "react";
import { Check, RefreshCcw, RotateCw, X } from "lucide-react";
import { memoryApi, type MemoryFactHistory, type MemoryJobStatus, type MemoryReview } from "./memory-client";

/** Suggestions stay separate from active facts until explicitly approved. */
export function MemoryReviews({onChanged}: {onChanged: () => Promise<void>}) {
  const [reviews,setReviews]=useState<MemoryReview[]>([]);
  const [history,setHistory]=useState<MemoryFactHistory[]>([]);
  const [jobs,setJobs]=useState<MemoryJobStatus|null>(null);
  const [working,setWorking]=useState(false);
  const [confirmReplace,setConfirmReplace]=useState<number|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [notice,setNotice]=useState<string|null>(null);

  const refresh=async()=>{
    const [r,h,j]=await Promise.all([
      memoryApi.listReviews(),memoryApi.listFactHistory(),memoryApi.memoryJobsStatus()
    ]);
    setReviews(r);setHistory(h);setJobs(j);
  };
  useEffect(()=>{
    let alive=true;
    void Promise.all([
      memoryApi.listReviews(),memoryApi.listFactHistory(),memoryApi.memoryJobsStatus()
    ]).then(([r,h,j])=>{
      if(alive){setReviews(r);setHistory(h);setJobs(j);}
    }).catch(e=>{if(alive)setError(String(e));});
    return ()=>{alive=false;};
  },[]);

  const act=async(work:()=>Promise<void>)=>{
    if(working)return;
    setWorking(true);setError(null);setNotice(null);
    try {
      await work();
      await refresh();
      await onChanged();
    }catch(e){setError(e instanceof Error?e.message:String(e));}
    finally{setWorking(false);}
  };

  return <section className="memory-reviews" aria-label="Memory correction reviews">
    <div className="memory-review-heading">
      <strong>Suggested memory corrections ({reviews.length})</strong>
      <button type="button" className="secondary-action" disabled={working}
        onClick={()=>void act(async()=>{})}><RotateCw size={13}/> Refresh</button>
    </div>
    <p className="memory-explainer">
      If you correct something Mikan remembers, the old fact stays active until you review it.
      No background process replaces or deletes your memories.
    </p>
    {error&&<p className="memory-error" role="alert">{error}</p>}
    {notice&&<p role="status" className="memory-explainer">{notice}</p>}
    {jobs&&<p className="memory-explainer">
      Automatic extraction queue: {jobs.queued} waiting, {jobs.failed} requiring attention.
      {jobs.failed>0&&<button type="button" className="secondary-action" disabled={working}
        onClick={()=>void act(async()=>{
          const count=await memoryApi.retryFailedJobs();
          const result=await memoryApi.processPendingJobs();
          setNotice("Retried "+count+" job(s); "+result.queued+" still queued.");
        })}><RefreshCcw size={13}/> Retry failed jobs</button>}
    </p>}
    {jobs?.lastOutcome && <p className="memory-explainer">
      Last extraction: {new Date(jobs.lastOutcome.processedAt * 1000).toLocaleString()} · {
        (jobs.lastOutcome.userSaved + jobs.lastOutcome.characterSaved +
         jobs.lastOutcome.interestsSaved + jobs.lastOutcome.reviewQueued) === 0
          ? "Completed, but no memories or corrections were accepted."
          : [
              jobs.lastOutcome.userSaved ? jobs.lastOutcome.userSaved + " user facts" : "",
              jobs.lastOutcome.characterSaved ? jobs.lastOutcome.characterSaved + " Mikan details" : "",
              jobs.lastOutcome.interestsSaved ? jobs.lastOutcome.interestsSaved + " interests" : "",
              jobs.lastOutcome.reviewQueued ? jobs.lastOutcome.reviewQueued + " correction suggestions" : ""
            ].filter(Boolean).join(", ")
      }
    </p>}
    {reviews.map(review=><article className="memory-item" key={review.id}>
      <small>Suggested from your words: “{review.evidence}”</small>
      {review.existingFact&&<p><strong>Currently saved:</strong> {review.existingFact}</p>}
      <p><strong>Suggested:</strong> {review.proposedFact}</p>
      <div className="memory-actions">
        {(review.existingMemoryId!=null || review.existingInterestId!=null)&&(
          confirmReplace===review.id
          ? <>
              <span>Replace the existing saved memory and retain its revision history?</span>
              <button type="button" className="save-button" disabled={working}
                onClick={()=>void act(async()=>{
                  await memoryApi.resolveReview(review.id,"replace");
                  setConfirmReplace(null);
                })}><Check size={13}/> Confirm replace</button>
              <button type="button" onClick={()=>setConfirmReplace(null)}><X size={13}/> Cancel</button>
            </>
          : <button type="button" disabled={working} onClick={()=>setConfirmReplace(review.id)}>
              Replace old memory
            </button>
        )}
        <button type="button" disabled={working} onClick={()=>void act(
          ()=>memoryApi.resolveReview(review.id,"keep_both")
        )}>Keep both</button>
        <button type="button" disabled={working} onClick={()=>void act(
          ()=>memoryApi.resolveReview(review.id,"dismiss")
        )}>Dismiss suggestion</button>
      </div>
    </article>)}
    {history.length>0&&<details className="memory-session-notes">
      <summary>Previous approved corrections ({history.length})</summary>
      {history.map(item=><p key={item.id}>
        <small>Fact #{item.memoryId}</small>
        <span> {item.previousFact} → {item.replacementFact}</span>
      </p>)}
    </details>}
  </section>;
}
