/**
 * Subtle desktop presence for all Iki outfits. Pure, bounded, frame-rate-
 * independent math; no model, renderer, network or audio dependencies.
 */
export type AvatarPresencePreferences = {
  followCursor: boolean;
  dragSway: boolean;
};

export type AvatarMotionSample = {
  cursorX: number;
  cursorY: number;
  windowX: number;
  windowY: number;
  windowWidth: number;
  windowHeight: number;
  velocityX: number;
  velocityY: number;
  motionAgeMs: number;
};

export type AvatarMotionTarget = {
  eyeX: number;
  eyeY: number;
  headX: number;
  headY: number;
  weight: number;
  dragX: number;
  dragY: number;
};

export type AvatarPresence = AvatarMotionTarget & {
  dragVx: number;
  dragVy: number;
};

const PREFS_KEY = "mikan/avatar-presence/v1";
export const DEFAULT_AVATAR_PRESENCE: AvatarPresencePreferences = {
  followCursor: true,
  dragSway: true
};

const clamp = (v: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : 0));

export function loadAvatarPresencePreferences(): AvatarPresencePreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "null") as
      Partial<AvatarPresencePreferences> | null;
    return {
      followCursor: typeof raw?.followCursor === "boolean" ? raw.followCursor : true,
      dragSway: typeof raw?.dragSway === "boolean" ? raw.dragSway : true
    };
  } catch { return { ...DEFAULT_AVATAR_PRESENCE }; }
}

export function saveAvatarPresencePreferences(prefs: AvatarPresencePreferences): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); }
  catch { /* The controls still work in this session. */ }
}

export const NEUTRAL_MOTION: AvatarMotionTarget = {
  eyeX: 0, eyeY: 0, headX: 0, headY: 0, weight: 0, dragX: 0, dragY: 0
};
export const INITIAL_PRESENCE: AvatarPresence = {
  ...NEUTRAL_MOTION, dragVx: 0, dragVy: 0
};

export function motionTarget(
  sample: AvatarMotionSample | null,
  prefs: AvatarPresencePreferences,
  dragging: boolean
): AvatarMotionTarget {
  if (!sample) return NEUTRAL_MOTION;

  // Cursor is in desktop physical pixels, so use physical outer window bounds.
  // Her eyes live near the upper third of the transparent overlay, rather
  // than the vertical center of the draggable webview window.
  const dx = sample.cursorX - (sample.windowX + sample.windowWidth * 0.5);
  const dy = (sample.windowY + sample.windowHeight * 0.29) - sample.cursorY;
  const distance = Math.hypot(dx, dy);
  // Far-away monitors shouldn't make her stare sideways indefinitely.
  const near = clamp((1550 - distance) / 1080, 0, 1);
  const weight = prefs.followCursor && !dragging ? near : 0;

  const moveAge = Number.isFinite(sample.motionAgeMs) ? sample.motionAgeMs : 10000;
  // Ignore stale OS window-move events. A few frames of momentum are retained
  // by the spring integrator, so there's no abrupt halt when this reaches 0.
  const moveWeight = prefs.dragSway
    ? clamp((320 - moveAge) / 250, 0, 1) : 0;
  return {
    eyeX: clamp(dx / 460 * 0.58, -0.58, 0.58),
    eyeY: clamp(dy / 430 * 0.42, -0.42, 0.42),
    headX: clamp(dx / 600 * 3.3, -3.3, 3.3),
    headY: clamp(dy / 620 * 2.3, -2.3, 2.3),
    weight,
    dragX: -clamp(sample.velocityX / 1700, -1, 1) * moveWeight,
    dragY: clamp(sample.velocityY / 1700, -1, 1) * moveWeight
  };
}

export function advancePresence(
  previous: AvatarPresence,
  target: AvatarMotionTarget,
  deltaMs: number
): AvatarPresence {
  // Clamp at long frame hitches to avoid whipping the head after unhide.
  const dt = clamp(deltaMs, 0, 50) / 1000;
  const faceEase = 1 - Math.exp(-dt * 6);
  // Critically, drag is a damped spring, not a one-frame impulse:
  // hair takes a moment to catch up and keeps moving when the window stops.
  const damped = (position: number, velocity: number, goal: number) => {
    const nextVelocity = velocity + (goal - position) * 38 * dt - velocity * 9.5 * dt;
    const nextPosition = clamp(position + nextVelocity * dt, -1.15, 1.15);
    return [nextPosition, nextVelocity] as const;
  };
  const [dragX, dragVx] = damped(previous.dragX, previous.dragVx, target.dragX);
  const [dragY, dragVy] = damped(previous.dragY, previous.dragVy, target.dragY);
  return {
    eyeX: previous.eyeX + (target.eyeX - previous.eyeX) * faceEase,
    eyeY: previous.eyeY + (target.eyeY - previous.eyeY) * faceEase,
    headX: previous.headX + (target.headX - previous.headX) * faceEase,
    headY: previous.headY + (target.headY - previous.headY) * faceEase,
    weight: previous.weight + (target.weight - previous.weight) * faceEase,
    dragX, dragY, dragVx, dragVy
  };
}
