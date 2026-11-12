import type { AvatarReactionKind } from "./avatar-reactions";

export type AvatarDebugSnapshot = {
  status: "loading" | "ready" | "error";
  rig: string;
  fps: number;
  expressions: string[];
  motions: string[];
  lastReaction: {
    serial: number;
    kind: AvatarReactionKind;
    source: "reply" | "test";
    result: string;
  } | null;
  activeExpression: string | null;
  activeMotion: string | null;
  speaking: boolean;
  mouthOpen: number;
  breath: number | null;
  eyeL: number | null;
  eyeR: number | null;
  gazeX?: number;
  gazeY?: number;
  dragMomentum?: number;
  error?: string;
};

export function avatarDebugText(
  snapshot: AvatarDebugSnapshot | null,
  display: "animated" | "portrait",
  lastReplyCue: string
): string {
  if (display === "portrait") return "Avatar display: static portrait (Iki renderer inactive)";
  if (!snapshot) return "Iki renderer: not initialized";
  const reaction = snapshot.lastReaction;
  const number = (value: number | null) => value == null || !Number.isFinite(value) ? "n/a" : value.toFixed(2);
  return [
    "Iki renderer: " + snapshot.status,
    "Rig: " + snapshot.rig,
    "Frame rate: " + snapshot.fps.toFixed(0) + " fps",
    "Last reply cue: " + lastReplyCue,
    "Last reaction: " + (reaction
      ? `#${reaction.serial} ${reaction.kind} (${reaction.source}) - ${reaction.result}`
      : "none received"),
    "Active expression: " + (snapshot.activeExpression ?? "none"),
    "Active motion: " + (snapshot.activeMotion ?? "none"),
    "Available expressions: " + (snapshot.expressions.join(", ") || "none"),
    "Available motions: " + (snapshot.motions.join(", ") || "none"),
    "TTS playing: " + (snapshot.speaking ? "yes" : "no"),
    "Mouth open: " + number(snapshot.mouthOpen),
    "Breath: " + number(snapshot.breath),
    "Eyes L / R: " + number(snapshot.eyeL) + " / " + number(snapshot.eyeR),
    ...(snapshot.gazeX === undefined ? [] : [
      "Cursor gaze X / Y: " + number(snapshot.gazeX) + " / " + number(snapshot.gazeY ?? null),
      "Drag hair momentum: " + number(snapshot.dragMomentum ?? null)
    ]),
    ...(snapshot.error ? ["Error: " + snapshot.error] : [])
  ].join("\n");
}
