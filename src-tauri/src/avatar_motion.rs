//! Lightweight local motion sensors for Mikan's 2D avatar.
//! Cursor and window positions are read only while the avatar is visible and
//! the renderer requests a sample. No screen capture, hooks or persistence.
use serde::Serialize;
use std::{sync::Mutex, time::Instant};
use tauri::{PhysicalPosition, WebviewWindow};

#[derive(Default)]
struct MotionVelocity {
    previous: Option<(PhysicalPosition<i32>, Instant)>,
    last_motion_at: Option<Instant>,
    vx: f64,
    vy: f64,
}

impl MotionVelocity {
    fn record(&mut self, position: PhysicalPosition<i32>, now: Instant) {
        if let Some((previous, last_at)) = self.previous {
            let elapsed = now.duration_since(last_at).as_secs_f64();
            let dx = f64::from(position.x - previous.x);
            let dy = f64::from(position.y - previous.y);
            // Skip tiny pixel jitter and very long gaps (e.g. when waking).
            if (dx.abs() > 1.0 || dy.abs() > 1.0) && elapsed >= 0.004 && elapsed <= 0.5 {
                let instant_x = (dx / elapsed).clamp(-2200.0, 2200.0);
                let instant_y = (dy / elapsed).clamp(-2200.0, 2200.0);
                self.vx = self.vx * 0.35 + instant_x * 0.65;
                self.vy = self.vy * 0.35 + instant_y * 0.65;
                self.last_motion_at = Some(now);
            }
        }
        self.previous = Some((position, now));
    }

    fn at(&self, now: Instant) -> (f64, f64, f64) {
        let age_ms = self.last_motion_at
            .map(|then| now.duration_since(then).as_secs_f64() * 1000.0)
            .unwrap_or(f64::INFINITY);
        if age_ms > 750.0 { return (0.0, 0.0, age_ms); }
        (self.vx, self.vy, age_ms)
    }
}

#[derive(Default)]
pub struct AvatarWindowMotion(Mutex<MotionVelocity>);

impl AvatarWindowMotion {
    pub fn moved(&self, position: PhysicalPosition<i32>) {
        if let Ok(mut motion) = self.0.lock() {
            motion.record(position, Instant::now());
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AvatarMotionSample {
    cursor_x: f64,
    cursor_y: f64,
    window_x: i32,
    window_y: i32,
    window_width: u32,
    window_height: u32,
    velocity_x: f64,
    velocity_y: f64,
    motion_age_ms: f64,
}

/// One cheap native request instead of three separate window API requests.
#[tauri::command]
pub fn avatar_motion_sample(
    window: WebviewWindow,
    movement: tauri::State<'_, AvatarWindowMotion>,
) -> Result<AvatarMotionSample, String> {
    let cursor = window.cursor_position().map_err(|e| e.to_string())?;
    let origin = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    let (velocity_x, velocity_y, motion_age_ms) = movement.0.lock()
        .map(|motion| motion.at(Instant::now()))
        .unwrap_or((0.0, 0.0, f64::INFINITY));
    Ok(AvatarMotionSample {
        cursor_x: cursor.x, cursor_y: cursor.y,
        window_x: origin.x, window_y: origin.y,
        window_width: size.width, window_height: size.height,
        velocity_x, velocity_y, motion_age_ms,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn window_drag_generates_finite_velocity_then_expires() {
        let mut state = MotionVelocity::default();
        let now = Instant::now();
        state.record(PhysicalPosition::new(50, 100), now);
        state.record(PhysicalPosition::new(90, 120), now + Duration::from_millis(20));
        let (vx, vy, age) = state.at(now + Duration::from_millis(20));
        assert!(vx > 0.0 && vy > 0.0);
        assert_eq!(age, 0.0);
        let (vx, vy, _) = state.at(now + Duration::from_millis(900));
        assert_eq!((vx, vy), (0.0, 0.0));
    }
}
