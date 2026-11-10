import { useEffect,useRef,useState,type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  dragToRegion,finalizeRegionSelection,canStartRegionSelection,
  type RegionPickerPreview,type ScreenRegion
} from "./capture-region";
import "./region-picker.css";

type Point={x:number;y:number};
type Drag={start:Point;end:Point;width:number;height:number};

export default function RegionPicker(){
  const [preview,setPreview]=useState<RegionPickerPreview|null>(null);
  const [drag,setDrag]=useState<Drag|null>(null);
  const [locked,setLocked]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const activePointer=useRef<number|null>(null);
  const activeDrag=useRef<Drag|null>(null);
  const savingRef=useRef(false);
  const confirmButton=useRef<HTMLButtonElement|null>(null);

  useEffect(()=>{
    void invoke<RegionPickerPreview|null>("vision_region_preview")
      .then(p=>{if(!p)throw Error("Screen preview expired. Close the selector and try again.");setPreview(p);})
      .catch(err=>setError(String(err)));
  },[]);

  function point(event:ReactPointerEvent<HTMLDivElement>):Point {
    const rect=event.currentTarget.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(rect.width,event.clientX-rect.left)),
      y:Math.max(0,Math.min(rect.height,event.clientY-rect.top))
    };
  }

  function start(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==0||!preview||saving||activePointer.current!==null||
       !canStartRegionSelection(locked))return;
    event.preventDefault();
    const rect=event.currentTarget.getBoundingClientRect();
    const p=point(event);
    const next={start:p,end:p,width:rect.width,height:rect.height};
    activePointer.current=event.pointerId;
    activeDrag.current=next;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag(next);
    setError(null);
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    if(activePointer.current!==event.pointerId||!activeDrag.current)return;
    const next={...activeDrag.current,end:point(event)};
    activeDrag.current=next;
    setDrag(next);
  }
  function end(event:ReactPointerEvent<HTMLDivElement>){
    if(activePointer.current!==event.pointerId||!activeDrag.current||!preview)return;
    const next={...activeDrag.current,end:point(event)};
    activePointer.current=null;
    activeDrag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    setDrag(next);
    const review=finalizeRegionSelection(next.start,next.end,
      {width:next.width,height:next.height},
      {width:preview.sourceWidth,height:preview.sourceHeight});
    if(review.locked) {
      setLocked(true);
      setError(null);
    } else {
      setError("That rectangle is too small. Drag a larger area, at least 48 × 48 source pixels.");
    }
  }
  function interrupt(event:ReactPointerEvent<HTMLDivElement>){
    if(activePointer.current!==event.pointerId)return;
    activePointer.current=null;
    activeDrag.current=null;
    setDrag(null);
    setError("Selection interrupted. Try dragging the rectangle again.");
  }
  function redraw(){
    if(savingRef.current)return;
    activePointer.current=null;
    activeDrag.current=null;
    setLocked(false);
    setDrag(null);
    setError(null);
  }

  const selected:ScreenRegion|null=preview&&drag
    ? dragToRegion(drag.start,drag.end,
        {width:drag.width,height:drag.height},
        {width:preview.sourceWidth,height:preview.sourceHeight})
    : null;
  const rectangle=drag&&{
    left:Math.min(drag.start.x,drag.end.x)/drag.width*100+"%",
    top:Math.min(drag.start.y,drag.end.y)/drag.height*100+"%",
    width:Math.abs(drag.end.x-drag.start.x)/drag.width*100+"%",
    height:Math.abs(drag.end.y-drag.start.y)/drag.height*100+"%"
  };
  const cancel=()=>{if(!savingRef.current)void invoke("vision_region_cancel").catch(err=>setError(String(err)));};
  const save=async()=>{
    if(!locked||!selected||savingRef.current)return;
    savingRef.current=true;
    setSaving(true);
    setError(null);
    try {
      await invoke("vision_region_complete",{region:selected});
    } catch(err){
      setError(String(err));
      savingRef.current=false;
      setSaving(false);
    }
  };

  useEffect(()=>{
    if(locked)confirmButton.current?.focus();
  },[locked]);

  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();cancel();}
      else if(locked&&!savingRef.current&&event.key==="Enter"&&!event.repeat){
        event.preventDefault();
        void save();
      } else if(locked&&!savingRef.current&&event.key.toLowerCase()==="r"){
        event.preventDefault();
        redraw();
      }
    };
    window.addEventListener("keydown",key);
    return ()=>window.removeEventListener("keydown",key);
  },[locked,selected]);

  return <main className="region-picker" data-selection-state={locked?"review":"drawing"}>
    {preview && <div className={"region-picker-surface"+(locked?" region-picker-surface--locked":"")}
        role="img"
        aria-label={locked
          ?"Selected screen area. Use the confirmation controls to apply or redraw."
          :"Full monitor preview. Hold the left mouse button and drag to select the capture area."}
        onPointerDown={start} onPointerMove={move} onPointerUp={end}
        onPointerCancel={interrupt} onLostPointerCapture={interrupt}
        onContextMenu={event=>event.preventDefault()}>
      <img src={`data:image/jpeg;base64,${preview.capture.imageBase64}`}
        alt="" draggable={false}/>
      <div className="region-picker-tint" />
      {rectangle&&<div className="region-picker-rectangle" style={rectangle}>
        <span>{selected?`${selected.width} × ${selected.height} px`:"Drag to select"}</span>
      </div>}
    </div>}
    <section className={"region-picker-toolbar"+(locked?" region-picker-toolbar--review":"")}
      role={locked?"dialog":"group"} aria-label="Screen region selection controls"
      onPointerDown={event=>event.stopPropagation()}>
      <div><strong>Mikan · {locked?"Confirm capture area":"Select screen area"}</strong>
        <small>{preview?`${preview.capture.label} · ${preview.sourceWidth} × ${preview.sourceHeight}`
          :"Preparing monitor preview…"}</small>
      </div>
      <p>{locked
        ?"The highlighted rectangle is locked. Click Use this region or press Enter. To change it, click Redraw."
        :"Hold the left mouse button and drag across the screen. Release to review the area before saving."}</p>
      {selected&&<small aria-live="polite">
        Area: {selected.x}, {selected.y} · {selected.width} × {selected.height} px
      </small>}
      {error&&<p className="region-picker-error" role="alert">{error}</p>}
      <div className="region-picker-actions">
        {locked&&<button type="button" onClick={redraw} disabled={saving}>Redraw · R</button>}
        <button type="button" onClick={cancel} disabled={saving}>Cancel · Esc</button>
        <button type="button" ref={confirmButton} onClick={()=>void save()}
          disabled={!locked||!selected||saving}>
          {saving?"Saving…":"Use this region · Enter"}
        </button>
      </div>
    </section>
    {!preview&&!error&&<div className="region-picker-loading">Preparing screenshot…</div>}
  </main>;
}
