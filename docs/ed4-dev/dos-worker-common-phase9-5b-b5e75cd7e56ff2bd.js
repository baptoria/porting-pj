/* ED4 Mobile GPL-2.0-only, 2026. Adapter around unmodified emulators 0.73.8.
 * Capture manifest in the SAME synchronous message task as ws-persist.
 * Never infer deletion from the changed-files ZIP alone. */
let runtime;
let music = [];
const musicStats = { reads: 0, bytes: 0, largestRead: 0 };
let runtimeStage = 'worker-script', adapterOperation = 'idle', errorCount = 0;
const diagnosticSend = self.postMessage.bind(self);
// Whitelist strings/numbers only. No rejection-object stringify or memory dump.
function errorText(value, limit = 8192) {
  if (typeof value !== 'string') return '';
  return value.slice(0, limit * 2)
    .replace(/(?:https?|file|blob):\/\/[^\s)]+/gi, url => {
      if (/^file:/i.test(url)) return '[host-path]';
      const clean = url.split(/[?#]/)[0];
      return clean.slice(clean.lastIndexOf('/') + 1).replace(/^[^@]*@/, '');
    })
    .replace(/[A-Z]:[\\/](?:Users|home)[\\/][^\s)"']+|\/(?:Users|home|storage|sdcard|data\/user|private|tmp)\/[^\s)"']+/gi, '[host-path]')
    .replace(/\b(?:Bearer\s+\S+|(?:token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;)]+)/gi, '[credential]')
    .replace(/\b(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|AKIA[A-Z0-9]{16})\b/g, '[credential]')
    .slice(0, limit);
}
function runtimeError(source, error, event) {
  if (errorCount++ >= 16) return;
  const property = key => { try { return error?.[key]; } catch { return undefined; } };
  try {
    diagnosticSend({name:'ed4-runtime-error', props:{source,
      name:errorText(property('name'),128), message:errorText(property('message') || event?.message || (typeof error==='string'?error:'Non-Error rejection (payload omitted)'),2048),
      stack:errorText(property('stack')),filename:errorText(event?.filename,512),lineno:event?.lineno,colno:event?.colno,
      stage:runtimeStage,adapterOperation,wasmHeapBytes:runtime?.HEAPU8?.buffer?.byteLength,
      musicMounted:music.length,musicReads:musicStats.reads,musicBytes:musicStats.bytes}});
  } catch { /* Reporting cannot replace the original failure. */ }
}
self.addEventListener('error', event => runtimeError('worker-error',event.error,event));
self.addEventListener('unhandledrejection', event => runtimeError('unhandledrejection',event.reason));
self.addEventListener("message", (e) => {
  if (e.data?.name === "wc-install") music = e.data.props.ed4Music ?? [];
});
function mountMusic() {
  runtimeStage = 'preRun';
  if (!music.length) return;
  adapterOperation = 'mount';
  const FS = runtime.FS,
    reader = new FileReaderSync();
  FS.mkdirTree("/home/web_user");
  for (const { path, file } of music) {
    if (
      !/^[A-Z0-9_!#$%&'()@^`{}~.\/ -]+$/.test(path) ||
      path.split("/").some((p) => !p || p === "." || p === "..")
    )
      throw Error("Unsafe music path");
    const full = "/home/web_user/" + path,
      split = full.lastIndexOf("/"),
      parent = full.slice(0, split),
      name = full.slice(split + 1);
    FS.mkdirTree(parent);
    if (FS.analyzePath(full).exists)
      throw Error("Music mount collision: " + path);
    const node = FS.createFile(parent, name, {}, true, false);
    node.usedBytes = file.size;
    node.timestamp = 1;
    const deny = () => {
      throw new FS.ErrnoError(30);
    };
    const getattr = node.node_ops.getattr;
    node.node_ops = {
      ...node.node_ops,
      getattr(n) {
        const s = getattr(n);
        s.size = file.size;
        s.mtime = s.ctime = new Date(1);
        return s;
      },
      setattr(n, a) {
        if (a.size !== undefined) deny();
        n.timestamp = 1;
      },
    };
    node.stream_ops = {
      ...node.stream_ops,
      write: deny,
      allocate: deny,
      mmap: deny,
      read(_stream, buffer, offset, length, position) {
        adapterOperation = 'raw-read';
        const amount = Math.max(0, Math.min(length, file.size - position));
        let done = 0;
        while (done < amount) {
          const n = Math.min(amount - done, 1024 * 1024);
          const data = new Uint8Array(
            reader.readAsArrayBuffer(
              file.slice(position + done, position + done + n),
            ),
          );
          buffer.set(data, offset + done);
          done += data.length;
          musicStats.reads++;
          musicStats.bytes += data.length;
          musicStats.largestRead = Math.max(
            musicStats.largestRead,
            data.length,
          );
          if (data.length !== n) throw Error("Music read incomplete");
        }
        adapterOperation = 'raw-read-complete';
        return done;
      },
    };
    // A private copy of the parent's operations protects removal/rename too.
    const p = node.parent,
      ops = p.node_ops;
    p.node_ops = {
      ...ops,
      unlink(parent, key) {
        if (parent.contents[key] === node) deny();
        return ops.unlink(parent, key);
      },
      rename(old, newParent, newName) {
        if (old === node || newParent.contents[newName] === node) deny();
        return ops.rename(old, newParent, newName);
      },
    };
  }
  adapterOperation = 'mount-complete';
}
const send = self.postMessage.bind(self);
self.postMessage = function (message, transfer) {
  if (message?.name === 'ws-ready') runtimeStage = 'running';
  if (message?.name === 'ws-exit') runtimeStage = 'exited';
  if (message?.name === "ws-persist") {
    try {
      if (!runtime?.FS) throw Error("Filesystem unavailable");
      const paths = [];
      let bytes = 0;
      function walk(dir, relative) {
        for (const name of runtime.FS.readdir(dir)) {
          if (
            name === "." ||
            name === ".." ||
            (!relative && name.toLowerCase() === ".jsdos")
          )
            continue;
          const full = dir + "/" + name,
            path = relative ? relative + "/" + name : name;
          if (music.some((m) => m.path === path.toUpperCase())) continue;
          const stat = runtime.FS.lstat(full);
          if (runtime.FS.isDir(stat.mode)) walk(full, path);
          else if (runtime.FS.isFile(stat.mode)) {
            paths.push(path);
            bytes += stat.size;
          } else throw Error("Unsupported filesystem entry: " + path);
          if (paths.length > 12000 || bytes > 256 * 1024 * 1024)
            throw Error("DOS filesystem exceeds safe snapshot limit");
        }
      }
      const start = performance.now();
      walk("/home/web_user", "");
      message.props.ed4Snapshot = {
        paths,
        bytes,
        elapsedMs: performance.now() - start,
        wasmHeapBytes: runtime.HEAPU8.buffer.byteLength,
        music: { ...musicStats, mounted: music.length },
      };
    } catch (error) {
      message.props.ed4SnapshotError = String(error);
    }
  }
  return send(message, transfer);
};
runtimeStage = 'import-engine';
const selectedEngine = self.ed4DiagnosticEngine;
if(selectedEngine && !['phase9-2','phase9-3','phase9-4','phase9-5b'].includes(selectedEngine))throw Error('Unknown diagnostic engine');
const engineDirectory = selectedEngine?`./vendor/experimental/${selectedEngine}/`:'./vendor/';
importScripts(engineDirectory + "wdosbox.js");
const originalFactory = WDOSBOX;
WDOSBOX = function (options) {
  // The experiment must execute the exact module hashed by the parent, never
  // silently fall back to a second network fetch or the stable vendor path.
  if(selectedEngine && typeof options.instantiateWasm!=='function')throw Error('Verified diagnostic WASM module required');
  runtimeStage = 'factory';
  runtime = options;
  const priorAbort = options.onAbort;
  options.onAbort = reason => {
    runtimeError('emscripten-abort',new Error(typeof reason==='string'?reason:'Emscripten abort'));
    if (priorAbort) priorAbort(reason);
  };
  options.locateFile = (path) =>
    new URL(engineDirectory + path, self.location.href).href;
  const prior = options.preRun;
  options.preRun = [
    ...(typeof prior === "function" ? [prior] : (prior ?? [])),
    mountMusic,
  ];
  try {
    const result = originalFactory(options);
    return result.catch(error => { runtimeError('factory-rejection',error); throw error; });
  } catch (error) { runtimeError('factory-exception',error); throw error; }
};
// Bootstrap compatibility marker only; no CPU, filesystem, or engine changes.
self.ed4CommonWorkerRevision = 'phase9-5b-common-1';
