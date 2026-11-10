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
    iSupply.intervalSum += dt;
    iSupply.intervalMax = Math.max(iSupply.intervalMax, dt);
  }
  iLastSent = epoch;
  iSupply.packets++;
  iSupply.frames += samples.length;
  iSupply.sequence++;
  let peak = 0,
    sum = 0;
  for (let i = 0; i < samples.length; i++) {
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
  iSupply.processingSum += elapsed;
  iSupply.processingMax = Math.max(iSupply.processingMax, elapsed);
  if (epoch - iLastSummary >= 250) {
    iLastSummary = epoch;
    diagnosticSend({
      name: "ed4-supply-stats",
      props: {
        ...iSupply,
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
