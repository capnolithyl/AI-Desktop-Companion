import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  motionTarget, advancePresence, INITIAL_PRESENCE,
  type AvatarPresencePreferences, type AvatarMotionSample
} from "./avatar-presence";
import { IkiMotion, IkiPlayer } from "@ikijs/engine";
import { parseIkiModel, StandardParameter } from "@ikijs/format";
import bundledRigUrl from "../assets/iki/mikan-v02/iki-ready/mikan-auto-rig-v3.iki?url";
import type { AvatarReaction } from "./avatar-reactions";
import type { AvatarDebugSnapshot } from "./avatar-debug";

/**
 * Animated 2D Mikan. Framing is handled by the renderer, not by cropping
 * textures: her tail and lower body remain complete for later animation.
 */
export function IkiAvatar({
  customRig,
  speaking,
  reaction,
  rigLabel,
  debugVisible,
  presencePreferences,
  dragging,
  onDebug,
  onError
}: {
  customRig: Blob | null;
  speaking: boolean;
  reaction: AvatarReaction | null;
  rigLabel: string;
  debugVisible: boolean;
  presencePreferences: AvatarPresencePreferences;
  dragging: boolean;
  onDebug: (snapshot: AvatarDebugSnapshot) => void;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speakingRef = useRef(speaking);
  const errorRef = useRef(onError);
  const reactionRef = useRef(reaction);
  const debugRef = useRef(onDebug);
  const debugVisibleRef = useRef(debugVisible);
  const presencePreferencesRef = useRef(presencePreferences);
  const draggingRef = useRef(dragging);
  speakingRef.current = speaking;
  reactionRef.current = reaction;
  debugRef.current = onDebug;
  debugVisibleRef.current = debugVisible;
  presencePreferencesRef.current = presencePreferences;
  draggingRef.current = dragging;
  errorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let frame = 0;
    let player: IkiPlayer | null = null;
    let observer: ResizeObserver | null = null;
    let sampleTimer: ReturnType<typeof setInterval> | null = null;
    let latestSample: AvatarMotionSample | null = null;
    let samplePending = false;
    // Snapshot at mount start: events arriving while the model is loading
    // should still play once the renderer becomes ready.
    let seenReaction = reactionRef.current?.serial ?? 0;
    debugRef.current({
      status: "loading", rig: rigLabel, fps: 0, expressions: [], motions: [],
      lastReaction: null, activeExpression: null, activeMotion: null,
      speaking: speakingRef.current, mouthOpen: 0, breath: null, eyeL: null, eyeR: null
    });

    async function mount() {
      try {
        if (!canvas) return;
        player = new IkiPlayer(canvas);
        const currentPlayer = player;

        const resize = () => {
          const bounds = canvas.getBoundingClientRect();
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          canvas.width = Math.max(1, Math.round(bounds.width * ratio));
          canvas.height = Math.max(1, Math.round(bounds.height * ratio));
        };
        observer = new ResizeObserver(resize);
        observer.observe(canvas);
        resize();

        const raw: unknown = customRig
          ? JSON.parse(await customRig.text())
          : await (async () => {
              const response = await fetch(bundledRigUrl);
              if (!response.ok) throw new Error("The bundled Mikan v3 rig could not be loaded.");
              return response.json() as Promise<unknown>;
            })();
        if (cancelled) return;

        const model = parseIkiModel(raw);
        const result = await currentPlayer.load(model);
        if (cancelled || result.superseded) return;
        if (result.failedTextures.length) {
          throw new Error(`Iki could not load ${result.failedTextures.length} avatar texture(s).`);
        }

        // A portrait crop matching Mikan's reference: ears and tail remain
        // visible while most of the shorts / lower half are outside the view.
        // Model canvas is 1280 x 1280, with model-space Y increasing upward.
        currentPlayer.setView({ x: 0, y: 110, width: 1150, height: 1050 });
        currentPlayer.start();

        // Iki writes idle/blinks/expression values through this sink, then
        // reads those same parameters for hair/tail spring physics. Applying
        // tiny cursor and drag offsets HERE (not after motion.update) lets
        // the existing rig physics respond naturally with a delayed sway.
        let presence = { ...INITIAL_PRESENCE };
        const ranges = new Map(model.parameters.map(p => [p.id, p]));
        const boundedWrite = (name: string, value: number) => {
          const eye = presence.weight;
          switch (name) {
            case StandardParameter.EyeballX:
              value += (presence.eyeX - value) * eye;
              break;
            case StandardParameter.EyeballY:
              value += (presence.eyeY - value) * eye;
              break;
            case StandardParameter.AngleX:
              value += presence.headX * eye + presence.dragX * 1.15;
              break;
            case StandardParameter.AngleY:
              value += presence.headY * eye + presence.dragY * 0.8;
              break;
            case StandardParameter.AngleZ:
              value += presence.dragX * 1.65;
              break;
            case StandardParameter.AmbientSway:
              value += presence.dragX * 0.48;
              break;
          }
          const range = ranges.get(name);
          if (range) value = Math.min(range.max, Math.max(range.min, value));
          currentPlayer.setParameter(name, value);
        };
        const motion = new IkiMotion(
          model,
          (name) => currentPlayer.getParameter(name),
          boundedWrite
        );
        // Sample cursor + OS window drag velocity at 15 Hz, independently of
        // render FPS. Never poll when the webview is backgrounded, and only
        // while the 2D rig is actually mounted.
        const pollMotion = async () => {
          if (cancelled || samplePending || document.hidden) return;
          if (!presencePreferencesRef.current.followCursor
              && !presencePreferencesRef.current.dragSway) return;
          samplePending = true;
          try {
            const result = await invoke<AvatarMotionSample>("avatar_motion_sample");
            if (!cancelled) latestSample = result;
          } catch {
            // Optional effect; the rig keeps its normal Iki idle on failure.
            if (!cancelled) latestSample = null;
          } finally {
            samplePending = false;
          }
        };
        void pollMotion();
        sampleTimer = setInterval(() => { void pollMotion(); }, 65);
        // Reactions are events rather than permanent state. Matching the
        // imported rig's declared names keeps seasonal costume rigs compatible.
        const expressionNames = new Map(
          (model.expressions ?? []).map(item => [item.id.toLowerCase(), item.id])
        );
        const motionNames = Object.keys(model.motions ?? {});
        const findMotion = (name: string) =>
          motionNames.find(group => group.toLowerCase() === name.toLowerCase());
        let expressionEndsAt = 0;
        let expressionActive = false;
        let activeExpression: string | null = null;
        let activeMotion: string | null = null;
        let motionEndsAt = 0;
        let lastReaction: AvatarDebugSnapshot["lastReaction"] = null;
        let mouthOpen = 0;
        let previous = 0;
        let fps = 0;
        let frames = 0;
        let fpsSampleAt = performance.now();
        let lastDebugAt = 0;
        const parameter = (name: string): number | null => {
          try {
            const value = currentPlayer.getParameter(name);
            return typeof value === "number" && Number.isFinite(value) ? value : null;
          } catch { return null; }
        };
        const publishDebug = () => debugRef.current({
          status: "ready", rig: rigLabel, fps, expressions: [...expressionNames.values()],
          motions: motionNames, lastReaction, activeExpression, activeMotion,
          speaking: speakingRef.current, mouthOpen,
          breath: parameter("ParamBreath"), eyeL: parameter("ParamEyeLOpen"),
          eyeR: parameter("ParamEyeROpen"),
          gazeX: presence.eyeX * presence.weight,
          gazeY: presence.eyeY * presence.weight,
          dragMomentum: presence.dragX
        });
        publishDebug();
        const tick = (now: number) => {
          if (cancelled) return;
          if (!document.hidden) {
            presence = advancePresence(
              presence,
              motionTarget(latestSample, presencePreferencesRef.current, draggingRef.current),
              previous ? now - previous : 16
            );
            const nextReaction = reactionRef.current;
            if (nextReaction && nextReaction.serial !== seenReaction) {
              seenReaction = nextReaction.serial;
              const kind = nextReaction.kind;
              const expression = kind === "nod" ? "smile"
                : kind === "shake" ? "sad" : kind;
              const expressionId = expressionNames.get(expression);
              const playedExpression = Boolean(expressionId && motion.playExpression(expressionId));
              if (playedExpression) {
                expressionActive = true;
                activeExpression = expressionId ?? null;
                expressionEndsAt = now + (kind === "laugh" ? 3100 : 2400);
              }
              const gesture = kind === "nod" ? "Nod"
                : kind === "shake" ? "Shake"
                : kind === "surprised" ? "Tilt" : null;
              const group = gesture ? findMotion(gesture) : undefined;
              if (group) {
                motion.playMotion(group, 0);
                activeMotion = group;
                motionEndsAt = now + 1200;
              }
              lastReaction = {
                serial: nextReaction.serial, kind, source: nextReaction.source ?? "reply",
                result: playedExpression
                  ? (group ? `expression ${expressionId} + motion ${group}` : `expression ${expressionId}`)
                  : group ? `motion ${group}; expression ${expression} not available`
                    : `no matching expression (${expression}) or gesture`
              };
              publishDebug();
            }
            if (expressionActive && now >= expressionEndsAt) {
              motion.stopExpression();
              expressionActive = false;
              activeExpression = null;
            }
            if (activeMotion && now >= motionEndsAt) activeMotion = null;
            motion.update(now);
            // Lightweight interim lip motion while Pocket/Qwen WAV is playing.
            // Actual audio-amplitude lip-sync can replace this later.
            const syllable = Math.abs(Math.sin(now * 0.020) * Math.sin(now * 0.0061 + 0.5));
            const target = speakingRef.current ? 0.16 + syllable * 0.72 : 0;
            mouthOpen += (target - mouthOpen) * Math.min(1, (previous ? now - previous : 16) / 65);
            currentPlayer.setParameter(StandardParameter.MouthOpen, mouthOpen);
            frames++;
            if (now - fpsSampleAt >= 1000) {
              fps = frames * 1000 / Math.max(1, now - fpsSampleAt);
              frames = 0;
              fpsSampleAt = now;
            }
            if (debugVisibleRef.current && now - lastDebugAt >= 350) {
              lastDebugAt = now;
              publishDebug();
            }
          }
          previous = now;
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : String(error);
          debugRef.current({
            status: "error", rig: rigLabel, fps: 0, expressions: [], motions: [],
            lastReaction: null, activeExpression: null, activeMotion: null,
            speaking: speakingRef.current, mouthOpen: 0, breath: null, eyeL: null, eyeR: null,
            error: message
          });
          errorRef.current(message);
        }
      }
    }

    void mount();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      if (sampleTimer) clearInterval(sampleTimer);
      observer?.disconnect();
      player?.destroy();
    };
  }, [customRig]);

  return <canvas
    ref={canvasRef}
    className="iki-avatar-canvas"
    aria-label="Animated Mikan avatar"
    role="img"
  />;
}
