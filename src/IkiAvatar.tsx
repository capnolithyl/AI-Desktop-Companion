import { useEffect, useRef } from "react";
import { IkiMotion, IkiPlayer } from "@ikijs/engine";
import { parseIkiModel, StandardParameter } from "@ikijs/format";
import bundledRigUrl from "../assets/iki/mikan-v02/iki-ready/mikan-auto-rig-v3.iki?url";

/**
 * Animated 2D Mikan. Framing is handled by the renderer, not by cropping
 * textures: her tail and lower body remain complete for later animation.
 */
export function IkiAvatar({
  customRig,
  speaking,
  onError
}: {
  customRig: Blob | null;
  speaking: boolean;
  onError: (message: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speakingRef = useRef(speaking);
  const errorRef = useRef(onError);
  speakingRef.current = speaking;
  errorRef.current = onError;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let cancelled = false;
    let frame = 0;
    let player: IkiPlayer | null = null;
    let observer: ResizeObserver | null = null;

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

        // IkiMotion advances blinking, idle movement, and spring physics.
        // Our app supplies the speech signal after idle updates.
        const motion = new IkiMotion(
          model,
          (name) => currentPlayer.getParameter(name),
          (name, value) => currentPlayer.setParameter(name, value)
        );
        let mouthOpen = 0;
        let previous = 0;
        const tick = (now: number) => {
          if (cancelled) return;
          if (!document.hidden) {
            motion.update(now);
            // Lightweight interim lip motion while Pocket/Qwen WAV is playing.
            // Actual audio-amplitude lip-sync can replace this later.
            const syllable = Math.abs(Math.sin(now * 0.020) * Math.sin(now * 0.0061 + 0.5));
            const target = speakingRef.current ? 0.16 + syllable * 0.72 : 0;
            mouthOpen += (target - mouthOpen) * Math.min(1, (previous ? now - previous : 16) / 65);
            currentPlayer.setParameter(StandardParameter.MouthOpen, mouthOpen);
          }
          previous = now;
          frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      } catch (error) {
        if (!cancelled) errorRef.current(error instanceof Error ? error.message : String(error));
      }
    }

    void mount();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
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
