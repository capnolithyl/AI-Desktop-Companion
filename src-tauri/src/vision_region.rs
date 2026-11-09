//! Temporary full-monitor selection surface. Preview stays inside native RAM;
 //! the picker window never loads websites, and the actual image is only used
 //! to draw a rectangle before saving physical monitor coordinates.
use crate::screen_vision::{self, ScreenCapture, ScreenRegion};
use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder
};
use xcap::Monitor;

#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RegionPickerPreview {
    pub capture: ScreenCapture,
    pub monitor_index: usize,
    pub source_width: u32,
    pub source_height: u32,
}

#[derive(Clone, Serialize)]
#[serde(rename_all="camelCase")]
pub struct RegionPickerChoice {
    pub monitor_index:usize,
    pub region:ScreenRegion
}

#[derive(Default)]
pub struct RegionPickerState(pub Mutex<Option<RegionPickerPreview>>);

/// Capture before opening the always-on-top picker, otherwise its own
/// darkened overlay would be included in the screenshot.
#[tauri::command]
pub async fn vision_region_open(app:tauri::AppHandle,monitor_index:usize)->Result<(),String>{
    if app.get_webview_window("region-picker").is_some(){
        return Err("The region selector is already open".into());
    }
    let monitors=Monitor::all().map_err(|e|e.to_string())?;
    let monitor=monitors.get(monitor_index).ok_or("Selected display is not available")?;
    let width=monitor.width().map_err(|e|e.to_string())?;
    let height=monitor.height().map_err(|e|e.to_string())?;
    let x=monitor.x().map_err(|e|e.to_string())?;
    let y=monitor.y().map_err(|e|e.to_string())?;

    let capture=screen_vision::vision_capture(app.clone(),monitor_index,None).await?;
    let preview=RegionPickerPreview{
        capture, monitor_index, source_width:width,source_height:height
    };
    {
        let state=app.state::<RegionPickerState>();
        let mut value=state.0.lock().map_err(|_|"Region selector unavailable")?;
        *value=Some(preview);
    }

    // Native physical positioning preserves ultrawide coordinates and monitor
    // DPI scaling, including secondary displays to the left of primary.
    let built=WebviewWindowBuilder::new(
        &app,"region-picker",WebviewUrl::App("index.html?region-picker=1".into()))
        .title("Mikan · Select capture region")
        .decorations(false).transparent(false)
        .always_on_top(true).skip_taskbar(true)
        .resizable(false).inner_size(800.,600.).build();
    let picker=match built {
        Ok(w)=>w,
        Err(e)=>{
            let state=app.state::<RegionPickerState>();
            if let Ok(mut slot)=state.0.lock(){*slot=None;}
            return Err(format!("Cannot open region picker: {e}"));
        }
    };
    let placed=picker.set_position(PhysicalPosition::new(x,y))
        .and_then(|_|picker.set_size(PhysicalSize::new(width,height)));
    if let Err(e)=placed {
        let _=picker.close();
        return Err(format!("Cannot position region picker: {e}"));
    }
    let _=picker.set_focus();
    Ok(())
}

#[tauri::command]
pub fn vision_region_preview(
    state:tauri::State<'_,RegionPickerState>,
    window:tauri::WebviewWindow
)->Result<Option<RegionPickerPreview>,String>{
    if window.label()!="region-picker"{
        return Err("The region preview is restricted to the selection window".into());
    }
    let slot=state.0.lock().map_err(|_|"Region picker unavailable")?;
    Ok(slot.clone())
}

#[tauri::command]
pub fn vision_region_complete(
    app:tauri::AppHandle,
    window:tauri::WebviewWindow,
    region:ScreenRegion
)->Result<(),String>{
    if window.label()!="region-picker" {
        return Err("Only the region picker can finalize a selection".into());
    }
    let choice={
        let state=app.state::<RegionPickerState>();
        let slot=state.0.lock().map_err(|_|"Region picker unavailable")?;
        let selected=slot.as_ref().ok_or("Region selection expired")?;
        if !screen_vision::valid_region(region,selected.source_width,selected.source_height) {
            return Err("Drag a region at least 48 by 48 pixels, inside the display".into());
        }
        RegionPickerChoice{monitor_index:selected.monitor_index,region}
    };
    // Send only numeric geometry, never the screenshot, to Mikan's main UI.
    app.emit_to("main","mikan://region-selected",choice).map_err(|e|e.to_string())?;
    window.close().map_err(|e|e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn vision_region_cancel(window:tauri::WebviewWindow)->Result<(),String>{
    if window.label()!="region-picker" {return Err("Invalid selection window".into());}
    window.close().map_err(|e|e.to_string())
}
