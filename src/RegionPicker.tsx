import { useEffect,useState,type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { dragToRegion,type RegionPickerPreview,type ScreenRegion } from "./capture-region";
import "./region-picker.css";

type Point={x:number;y:number};
type Drag={start:Point;end:Point;width:number;height:number};

export default function RegionPicker(){
  const [preview,setPreview]=useState<RegionPickerPreview|null>(null);
  const [drag,setDrag]=useState<Drag|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{
    void invoke<RegionPickerPreview|null>("vision_region_preview")
      .then(p=>{if(!p)throw Error("Screen preview expired. Close the selector and try again.");setPreview(p);})
      .catch(err=>setError(String(err)));
  },[]);
  const cancel=()=>void invoke("vision_region_cancel").catch(err=>setError(String(err)));
  useEffect(()=>{
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.preventDefault();cancel();}
    };
    window.addEventListener("keydown",key);
    return ()=>window.removeEventListener("keydown",key);
  },[]);

  function point(event:ReactPointerEvent<HTMLDivElement>):Point{
    const rect=event.currentTarget.getBoundingClientRect();
    return {
      x:Math.max(0,Math.min(rect.width,event.clientX-rect.left)),
      y:Math.max(0,Math.min(rect.height,event.clientY-rect.top))
    };
  }
  function start(event:ReactPointerEvent<HTMLDivElement>){
    if(event.button!==0||!preview)return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect=event.currentTarget.getBoundingClientRect();
    const p=point(event);
    setDrag({start:p,end:p,width:rect.width,height:rect.height});
    setError(null);
  }
  function move(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag)return;
    setDrag({...drag,end:point(event)});
  }
  function end(event:ReactPointerEvent<HTMLDivElement>){
    if(!drag)return;
    const p=point(event);
    setDrag({...drag,end:p});
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
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
  const save=async()=>{
    if(!selected||saving)return;
    setSaving(true);
    setError(null);
    try {
      await invoke("vision_region_complete",{region:selected});
    } catch(err){
      setError(String(err));
      setSaving(false);
    }
  };

  return <main className="region-picker">
    {preview && <div className="region-picker-surface" role="img"
        aria-label="Full monitor preview. Drag with the mouse to select the capture area."
        onPointerDown={start} onPointerMove={move} onPointerUp={end}
        onContextMenu={event=>event.preventDefault()}>
      <img src={\`data:image/jpeg;base64,\${preview.capture.imageBase64}\`}
        alt="" draggable={false}/>
      <div className="region-picker-tint" />
      {rectangle&&<div className="region-picker-rectangle" style={rectangle}>
        <span>{selected?\`\${selected.width} × \${selected.height} px\`:"Drag to select"}</span>
      </div>}
    </div>}
    <div className="region-picker-toolbar">
      <div><strong>Mikan · Select screen area</strong>
        <small>{preview?\`\${preview.capture.label} · \${preview.sourceWidth} × \${preview.sourceHeight}\`
          :"Preparing monitor preview…"}</small>
      </div>
      <p>Drag a rectangle around what Mikan should see. The cropped area is captured before resizing.</p>
      {selected&&<small>
        Area: {selected.x}, {selected.y} · {selected.width} × {selected.height} px
      </small>}
      {error&&<p className="region-picker-error" role="alert">{error}</p>}
      <div className="region-picker-actions">
        <button onClick={cancel} disabled={saving}>Cancel · Esc</button>
        <button onClick={()=>void save()} disabled={!selected||saving}>
          {saving?"Saving…":"Use this region"}
        </button>
      </div>
    </div>
    {!preview&&!error&&<div className="region-picker-loading">Preparing screenshot…</div>}
  </main>;
}
