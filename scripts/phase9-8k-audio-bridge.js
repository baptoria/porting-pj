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
