import {defineConfig} from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath} from "node:url";
import {buildInfo} from "./build-info.mjs";
export default defineConfig({
 root:fileURLToPath(new URL("./web",import.meta.url)),
 base:"/workspace/",
 define:{__MIKAN_NAS_BUILD__:JSON.stringify(buildInfo())},
 publicDir:fileURLToPath(new URL("../public",import.meta.url)),
 plugins:[react(),tailwindcss()],
 build:{outDir:fileURLToPath(new URL("./web-dist",import.meta.url)),emptyOutDir:true,assetsInlineLimit:0}
});
