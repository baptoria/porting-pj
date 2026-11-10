// Keep Asyncify yield asynchronous, but avoid the UI-thread round trip.
const iYield = new MessageChannel();
let iYieldPending = null;
const iYieldStats = { requests: 0, acks: 0, maxDelayMs: 0, totalDelayMs: 0 };
iYield.port1.onmessage = (e) => {
  const pending = iYieldPending;
  if (!pending || pending.sessionId !== e.data.sessionId) return;
  iYieldPending = null;
  const delay = performance.now() - pending.at;
  iYieldStats.maxDelayMs = Math.max(iYieldStats.maxDelayMs, delay);
  iYieldStats.totalDelayMs += delay;
  if (
    runtime?.alive &&
    typeof runtime.sync_wakeUp === "function" &&
    runtime.sessionId === e.data.sessionId
  ) {
    iYieldStats.acks++;
    runtime.receive({ data: { name: "wc-sync-sleep", props: e.data } });
  }
};
iYield.port1.start();
// I-only direct Worker -> AudioWorklet PCM. No main-thread PCM cloning or per-block DOM work.
let iAudioPort = null,
  iSourceRate = 22050,
  iLastSent = 0,
  iFirstSent = 0,
  iLastSummary = 0;
const iSupply = {
  packets: 0,
  frames: 0,
  intervalSum: 0,
  intervalMax: 0,
  processingSum: 0,
  processingMax: 0,
  sequence: 0,
  signal: false,
  startup: { blocks: 0, samples: 0, sum: 0, peak: 0 },
};
self.addEventListener("message", (event) => {
  if (event.data?.name !== "ed4-audio-port") return;
  event.stopImmediatePropagation();
  if (iAudioPort) throw Error("Audio port already attached");
  iAudioPort = event.data.port;
  iAudioPort.start();
});
function iAudioMessage(message) {
  if(message?.name === "ws-update-lines" || message?.name === "ws-frame") kVideo++;
  if (message?.name === "ws-sync-sleep") {
    if (iYieldPending) throw Error("Duplicate Asyncify yield");
    iYieldStats.requests++;
    iYieldPending = {
      sessionId: message.props.sessionId,
      at: performance.now(),
    };
    iYield.port2.postMessage(message.props);
    return true;
  }
  if (message?.name === "ws-sound-init") iSourceRate = message.props.freq;
  if (message?.name !== "ws-sound-push" || !iAudioPort) return false;
  const start = performance.now(),
    epoch = performance.timeOrigin + start,
    samples = message.props.samples;
  if (!iFirstSent) iFirstSent = epoch;
  if (iLastSent) {
    const dt = epoch - iLastSent;
    kIntervalMax=Math.max(kIntervalMax,dt);kIntervalSum+=dt;kIntervals++;
    iSupply.intervalSum += dt;
    iSupply.intervalMax = Math.max(iSupply.intervalMax, dt);
  }
  iLastSent = epoch;
  iSupply.packets++;
  iSupply.frames += samples.length;
  iSupply.sequence++;
  let peak = 0,
    sum = 0;
  for (let i = 0; i < (epoch-iFirstSent<60000||!iSupply.signal?samples.length:0); i++) {
    peak = Math.max(peak, Math.abs(samples[i]));
    sum += samples[i];
  }
  iSupply.signal ||= peak > 0.001;
  if (epoch - iFirstSent < 60000) {
    iSupply.startup.blocks++;
    iSupply.startup.samples += samples.length;
    iSupply.startup.sum += sum;
    iSupply.startup.peak = Math.max(iSupply.startup.peak, peak);
  }
  const copy = samples.slice();
  iAudioPort.postMessage(
    {
      kind: "pcm",
      samples: copy,
      sourceRate: iSourceRate,
      sentEpoch: epoch,
      sequence: iSupply.sequence,
    },
    [copy.buffer],
  );
  const elapsed = performance.now() - start;
  kProcessingMax=Math.max(kProcessingMax,elapsed);kProcessingSum+=elapsed;
  iSupply.processingSum += elapsed;
  iSupply.processingMax = Math.max(iSupply.processingMax, elapsed);
  if (epoch - iLastSummary >= 250) {
    iLastSummary = epoch;
    diagnosticSend({
      name: "ed4-supply-stats",
      props: {
        ...iSupply,
        rateWindows: kReport(),
        startup: { ...iSupply.startup },
        sourceRate: iSourceRate,
        sentEpoch: epoch,
        elapsedMs: epoch - iFirstSent,
        guestTicks: runtime?._ed4_perf_value?.(2),
      },
    });
  }
  return true;
}

// Bounded, source-only metadata. A window ends at each actual native speed change.
let kVideo=0,kOrdinal=0,kBase=null,kIntervalMax=0,kIntervalSum=0,kIntervals=0,kProcessingMax=0,kProcessingSum=0;
const kWindows=[],kTotals={1:{ms:0,frames:0,ticks:0},2:{ms:0,frames:0,ticks:0}};
function kSample(){return {at:performance.now(),rate:runtime?._ed4_speed_value?.()??1,frames:iSupply.frames,packets:iSupply.packets,ticks:runtime?._ed4_perf_value?.(2)??0,video:kVideo};}
function kBoundary(){
 const n=kSample(),b=kBase;kBase=n;
 if(!b||n.at-b.at<0.01){kIntervalMax=kIntervalSum=kIntervals=kProcessingMax=kProcessingSum=0;return;}
 const ms=n.at-b.at,frames=n.frames-b.frames,ticks=n.ticks-b.ticks,t=kTotals[b.rate];
 t.ms+=ms;t.frames+=frames;t.ticks+=ticks;
 if(kWindows.length===256)kWindows.shift();
 kWindows.push({sequence:++kOrdinal,rate:b.rate,ms,frames,pcmFramesPerSecond:frames*1000/ms,targetFramesPerSecond:iSourceRate*b.rate,guestTicks:ticks,guestTicksPerSecond:ticks*1000/ms,packets:n.packets-b.packets,videoUpdates:n.video-b.video,workerIntervalMaxMs:kIntervalMax,workerIntervalMeanMs:kIntervalSum/Math.max(1,kIntervals),workerProcessingMaxMs:kProcessingMax,workerProcessingMs:kProcessingSum,intervalLimit:"first packet may span preceding rate/window",sourceSilenceMs:iLastSent?performance.timeOrigin+n.at-iLastSent:0,cycles:runtime?._ed4_perf_value?.(0),cyclesAuto:runtime?._ed4_perf_value?.(1),nativeFrames:runtime?._ed4_audio_value?.(0),nativeUnderflows:runtime?._ed4_audio_value?.(1),nativeClamps:runtime?._ed4_audio_value?.(2),scheduler:{yields:runtime?._ed4_supply_value?.(0),maxBusyMs:runtime?._ed4_supply_value?.(1),clampedWallTicks:runtime?._ed4_supply_value?.(2),clampEvents:runtime?._ed4_supply_value?.(3),idleMs:runtime?._ed4_supply_value?.(4)}});
 kIntervalMax=kIntervalSum=kIntervals=kProcessingMax=kProcessingSum=0;
}
function kReport(){return {windows:kWindows.slice(-2),totals:kTotals,limit:256,overwritten:Math.max(0,kOrdinal-256),clock:'Worker wall time; transition windows sealed before native speed change',samplesExported:false};}
setInterval(()=>{if(runtimeStage!=='running')return;kBoundary();diagnosticSend({name:'ed4-supply-stats',props:{...iSupply,startup:{...iSupply.startup},sourceRate:iSourceRate,sentEpoch:performance.timeOrigin+performance.now(),elapsedMs:iFirstSent?performance.timeOrigin+performance.now()-iFirstSent:0,guestTicks:runtime?._ed4_perf_value?.(2),rateWindows:kReport()}});},500);

// GPL-2.0-only. Only the explicitly selected, pinned I Worker enables this protocol.
let speedSession = null,
  speedSequence = 0,
  cyclePolicy = 0;
self.addEventListener("message", (event) => {
  const m = event.data;
  if (m?.name !== "ed4-speed-request") return;
  event.stopImmediatePropagation();
  const p = m.props;
  if (
    !p ||
    typeof p.session !== "string" ||
    p.session.length > 80 ||
    !Number.isSafeInteger(p.id) ||
    p.id < 1
  )
    return;
  let result = { session: p.session, id: p.id, engine: "phase9-8k", ok: false };
  try {
    if (self.ed4DiagnosticEngine !== "phase9-8k" || runtimeStage !== "running")
      throw Error("Speed backend not running");
    if (
      typeof runtime?._ed4_speed_value !== "function" ||
      typeof runtime?._ed4_audio_value !== "function"
    )
      throw Error("Native speed/audio exports unavailable");
    if (speedSession === null) {
      if (p.kind !== "set" || p.rate !== 1)
        throw Error("Initialize speed at 1x");
      cyclePolicy = p.policy ?? 0;
      if (![0, 12000, 16000, 24000].includes(cyclePolicy))
        throw Error("Invalid cycle policy");
      speedSession = p.session;
      runtime._ed4_perf_value(10);
    }
    if (p.session !== speedSession || p.id <= speedSequence)
      throw Error("Stale speed request");
    speedSequence = p.id;
    if (p.kind === "set") {
      if (p.rate !== 1 && p.rate !== 2) throw Error("Only 1x/2x supported");
      kBoundary();
      if (runtime._ed4_cycles_override(p.rate === 2 ? cyclePolicy : 0) < 0)
        throw Error("Cycle policy refused");
      if (runtime._ed4_test_set_speed(p.rate) !== p.rate)
        throw Error("Native speed refused");
      kBase=kSample();
    } else if (p.kind !== "status") throw Error("Unknown speed operation");
    result = {
      ...result,
      ok: true,
      rate: runtime._ed4_speed_value(),
      guestTicks: runtime._ed4_perf_value(2),
      cycles: runtime._ed4_perf_value(0),
      cyclesAuto: runtime._ed4_perf_value(1),
      cyclePolicy,
      yield: { ...iYieldStats, pending: !!iYieldPending },
      sampledCpuMs: runtime._ed4_perf_value(3),
      cpuSlices: runtime._ed4_perf_value(4),
      timedSlices: runtime._ed4_perf_value(6),
      audioFrames: runtime._ed4_audio_value(0),
      audioUnderflows: runtime._ed4_audio_value(1),
      audioClamps: runtime._ed4_audio_value(2),
      scheduler:{yields:runtime._ed4_supply_value(0),maxBusyMs:runtime._ed4_supply_value(1),clampedWallTicks:runtime._ed4_supply_value(2),clampEvents:runtime._ed4_supply_value(3),idleMs:runtime._ed4_supply_value(4)},
      workerTime: performance.now(),
    };
  } catch (e) {
    result.error = String(e.message).slice(0, 240);
  }
  self.postMessage({ name: "ed4-speed-response", props: result });
});

// GPL-2.0-only. Bounded metadata query; no sample/guest-memory export.
const bgmReadFirst=[],bgmReadTail=[];let bgmReadCount=0;
function bgmNameHash(path){let n=2166136261;for(const c of path.replace(/\\/g,'/').split('/').pop().toUpperCase())n=Math.imul(n^c.charCodeAt(0),16777619)>>>0;return n;}
function bgmRead(path,position,length){const e={sequence:++bgmReadCount,hash:bgmNameHash(path),position,length};if(bgmReadFirst.length<32)bgmReadFirst.push(e);else{if(bgmReadTail.length===256)bgmReadTail.shift();bgmReadTail.push(e);}}
function bgmSnapshot(){
 const get=runtime?._ed4_bgm_value;if(typeof get!=='function')throw Error('Missing BGM metadata export');
 const rows=get(-1,1),header=Array.from({length:33},(_,i)=>get(-1,i));
 if(!Number.isInteger(rows)||rows<0||rows>288)throw Error('BGM ring bounds');
 return {version:2,int69Returns:{matched:get(-2,0),overflow:get(-2,1),pending:get(-2,2)},header,rows:Array.from({length:rows},(_,r)=>Array.from({length:32},(_,c)=>get(r,c))),
 fileReads:{total:bgmReadCount,overwritten:Math.max(0,bgmReadCount-288),events:[...bgmReadFirst,...bgmReadTail]},
 tracks:music.map(m=>({hash:bgmNameHash(m.path),path:m.path}))};
}
self.addEventListener('message',event=>{
 if(event.data?.name!=='ed4-audio-status')return;event.stopImmediatePropagation();
 const id=event.data.id;if(!Number.isSafeInteger(id)||id<1)return;
 try{self.postMessage({name:'ed4-audio-status',props:{id,reads:musicStats.reads,bytes:musicStats.bytes,largestRead:musicStats.largestRead,mounted:music.length,bgm:bgmSnapshot()}});}
 catch {self.postMessage({name:'ed4-audio-status',props:{id,reads:musicStats.reads,bytes:musicStats.bytes,largestRead:musicStats.largestRead,mounted:music.length,bgm:{unavailable:true}}});}
});

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
        bgmRead(path,position,done);
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
// Included in the content-addressed Phase9-6 common Worker only.
let perfId=0,perfActive=false;
const nativePerf=key=>typeof runtime?._ed4_perf_value==='function'?runtime._ed4_perf_value(key):null;
function perfSample(){
 diagnosticSend({name:'ed4-performance',props:{id:perfId,epochMs:performance.timeOrigin+performance.now(),wasmHeapBytes:runtime?.HEAPU8?.buffer?.byteLength??null,
 cyclesMax:nativePerf(0),cyclesAuto:nativePerf(1),guestTicks:nativePerf(2),sampledDecoderWallMs:nativePerf(3),decoderSlices:nativePerf(4),core:nativePerf(5),decoderTimedSlices:nativePerf(6),decoderSampleStride:nativePerf(7)}});
}
self.addEventListener('message',e=>{
 const name=e.data?.name;if(!['ed4-perf-start','ed4-perf-poll','ed4-perf-stop'].includes(name))return;e.stopImmediatePropagation();
 const id=e.data?.id;if(!Number.isSafeInteger(id)||id<1)return;
 try{
  if(name==='ed4-perf-start'){perfId=id;nativePerf(10);perfActive=true;perfSample();}
  else if(id===perfId&&perfActive){perfSample();if(name==='ed4-perf-stop'){nativePerf(11);perfActive=false;}}
 }catch{nativePerf(11);perfActive=false;}
});

const send = self.postMessage.bind(self);
self.postMessage = function (message, transfer) {
  if(iAudioMessage(message))return;
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
  if(perfActive && message?.name==='ws-update-lines')message.props.ed4SentAt=performance.timeOrigin+performance.now();
  return send(message, transfer);
};
runtimeStage = 'import-engine';
const selectedEngine = self.ed4DiagnosticEngine;
if(selectedEngine && !['phase9-2','phase9-3','phase9-4','phase9-5b','phase9-6','phase9-8k'].includes(selectedEngine))throw Error('Unknown diagnostic engine');
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
self.ed4CommonWorkerRevision = 'phase9-8k-common-1';
