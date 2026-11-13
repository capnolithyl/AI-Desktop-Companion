import { defineConfig } from "vite";

/** Small standalone browser bundle; the Node relay serves only this output. */
export default defineConfig({
  publicDir: false,
  build: {
    outDir: "server/.generated",
    emptyOutDir: true,
    copyPublicDir: false,
    lib: {
      entry: "src/remote-avatar.ts",
      name: "MikanRemoteAvatar",
      formats: ["iife"],
      fileName: () => "avatar-engine.js"
    }
  }
});
