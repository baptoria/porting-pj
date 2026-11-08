import { defineConfig } from "vite";
import { unlink } from "node:fs/promises";
export default defineConfig({
  base: "/porting-pj/ed4/",
  build: { outDir: "docs/ed4" },
  define: { "import.meta.env.VITE_INCLUDE_SYNTHETIC_RAW": '"false"' },
  plugins: [{
    name: "manual-pages-without-raw-payloads",
    async closeBundle() {
      // Keep the Phase 3 fixture source/public copy; omit RAW bytes from deployment.
      await unlink("docs/ed4/synthetic-raw.zip").catch(error => {
        if(error.code !== "ENOENT") throw error;
      });
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
