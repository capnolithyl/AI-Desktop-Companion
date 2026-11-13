/**
 * Browser-side Iki player for the private remote UI. Same format, idle physics,
 * expressions and framing as desktop, but no Tauri API calls or second AI.
 * The browser receives only the currently selected rig after remote-key auth.
 */
import { IkiMotion, IkiPlayer } from "@ikijs/engine";
import { parseIkiModel, StandardParameter } from "@ikijs/format";
import { avatarViewport } from "./avatar-viewport";

type Reaction = "smile" | "laugh" | "angry" | "sad" | "surprised" | "nod" | "shake";

export function createRemoteAvatar(canvas: HTMLCanvasElement, raw: unknown, initialOffset = 0) {
  let stopped = false;
  let player: IkiPlayer | null = null;
  let motion: IkiMotion | null = null;
  let frame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let offset = initialOffset;
  let speaking = false;
  let mouth = 0;
  let lastTime = 0;
  let expressionEnds = 0;
  let reaction: Reaction | null = null;
  let targetEyeX = 0;
  let targetEyeY = 0;
  let eyeX = 0;
  let eyeY = 0;
  let expressionNames = new Map<string, string>();
  let motionNames: string[] = [];
  let expressionActive = false;

  const gaze = (event: PointerEvent) => {
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    targetEyeX = Math.max(-0.38, Math.min(0.38, (event.clientX - box.left) / box.width - 0.5));
    targetEyeY = Math.max(-0.25, Math.min(0.25, 0.5 - (event.clientY - box.top) / box.height));
  };
  const clearGaze = () => { targetEyeX = 0; targetEyeY = 0; };
  canvas.addEventListener("pointermove", gaze);
  canvas.addEventListener("pointerleave", clearGaze);

  const destroy = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    canvas.removeEventListener("pointermove", gaze);
    canvas.removeEventListener("pointerleave", clearGaze);
    player?.destroy();
    player = null;
    motion = null;
  };

  const ready = (async () => {
    const model = parseIkiModel(raw);
    if (stopped) return;
    const current = new IkiPlayer(canvas);
    player = current;
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const scale = Math.min(devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(bounds.width * scale));
      canvas.height = Math.max(1, Math.round(bounds.height * scale));
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    const result = await current.load(model);
    if (stopped || result.superseded) return;
    if (result.failedTextures.length) throw new Error("Avatar texture loading failed");
    current.setView(avatarViewport(offset));
    current.start();
    const ranges = new Map(model.parameters.map(parameter => [parameter.id, parameter]));
    motion = new IkiMotion(model, name => current.getParameter(name), (name, value) => {
      if (name === StandardParameter.EyeballX) value += eyeX;
      if (name === StandardParameter.EyeballY) value += eyeY;
      const range = ranges.get(name);
      if (range) value = Math.min(range.max, Math.max(range.min, value));
      current.setParameter(name, value);
    });
    expressionNames = new Map((model.expressions ?? []).map(e => [e.id.toLowerCase(), e.id]));
    motionNames = Object.keys(model.motions ?? {});
    const tick = (now: number) => {
      if (stopped) return;
      if (!document.hidden) {
        const elapsed = lastTime ? Math.min(100, now - lastTime) : 16;
        const smooth = Math.min(1, elapsed / 130);
        eyeX += (targetEyeX - eyeX) * smooth;
        eyeY += (targetEyeY - eyeY) * smooth;
        if (reaction) {
          const kind = reaction;
          reaction = null;
          const expression = kind === "nod" ? "smile" : kind === "shake" ? "sad" : kind;
          const match = expressionNames.get(expression);
          if (match) {
            motion?.playExpression(match);
            expressionActive = true;
            expressionEnds = now + (kind === "laugh" ? 3100 : 2400);
          }
          const gesture = kind === "nod" ? "Nod" : kind === "shake" ? "Shake" : kind === "surprised" ? "Tilt" : null;
          const group = gesture && motionNames.find(x => x.toLowerCase() === gesture.toLowerCase());
          if (group) motion?.playMotion(group, 0);
        }
        if (expressionActive && now >= expressionEnds) {
          motion?.stopExpression();
          expressionActive = false;
        }
        motion?.update(now);
        const syllable = Math.abs(Math.sin(now * 0.020) * Math.sin(now * 0.0061 + 0.5));
        const desired = speaking ? 0.16 + syllable * 0.72 : 0;
        mouth += (desired - mouth) * Math.min(1, elapsed / 65);
        current.setParameter(StandardParameter.MouthOpen, mouth);
      }
      lastTime = now;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  })().catch(error => {
    destroy();
    throw error;
  });

  return {
    ready,
    destroy,
    setSpeaking(value: boolean) { speaking = value; },
    setOffset(value: number) { offset = value; player?.setView(avatarViewport(offset)); },
    react(kind: string) {
      if (["smile", "laugh", "angry", "sad", "surprised", "nod", "shake"].includes(kind)) {
        reaction = kind as Reaction;
      }
    }
  };
}
