import { defineConfig } from "vite";
import { unlink,readFile,writeFile } from "node:fs/promises";
const developer=process.env.ED4_DEVELOPER_BUILD==='1';
const outDir=developer?'docs/ed4-dev':'docs/ed4';
export default defineConfig({
  base: developer?'/porting-pj/ed4-dev/':'/porting-pj/ed4/',
  build: { outDir, rollupOptions:{input:{main:'index.html',update:'update.html'}} },
  define: { "import.meta.env.VITE_DEVELOPER_TOOLS": JSON.stringify(process.env.ED4_DEVELOPER_BUILD === "1" ? "true" : "false"), "import.meta.env.VITE_INCLUDE_SYNTHETIC_RAW": '"false"' },
  plugins: [{
    name: "manual-pages-without-raw-payloads",
    async closeBundle() {
      // Keep the Phase 3 fixture source/public copy; omit RAW bytes from deployment.
      await unlink(outDir+"/synthetic-raw.zip").catch(error => {
        if(error.code !== "ENOENT") throw error;
      });
      if(developer){const path=outDir+'/manifest.webmanifest',manifest=JSON.parse(await readFile(path,'utf8'));manifest.name='ED4 Mobile — 개발 빌드 · 진단 전용';manifest.short_name='ED4 Dev';await writeFile(path,JSON.stringify(manifest,null,2)+'\n');}
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
