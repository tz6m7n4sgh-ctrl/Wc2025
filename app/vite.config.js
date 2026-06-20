import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// base: "./" makes the build work under any GitHub Pages path
// (https://<user>.github.io/<repo>/) without hardcoding the repo name.
// viteSingleFile inlines JS + CSS into one index.html so the app deploys as a
// single self-contained file at the repo root — the same model as the existing
// production page, so the live URL and PWA assets stay unchanged.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
  build: { cssCodeSplit: false, assetsInlineLimit: 100000000 },
});
