/** I Worker batches metadata at 4Hz; PCM goes directly to the AudioWorklet. */
export class AudioSupply {
  private latest: any = null;
  private rows: any[] = [];
  private delays = 0;
  private delaySum = 0;
  private delayMax = 0;
  receiveBatch(p: any) {
    if (!p || !Number.isFinite(p.sentEpoch) || !Number.isSafeInteger(p.frames))
      return;
    const delay = Math.max(
      0,
      performance.timeOrigin + performance.now() - p.sentEpoch,
    );
    this.delays++;
    this.delaySum += delay;
    this.delayMax = Math.max(this.delayMax, delay);
    this.latest = p;
    if (this.rows.length === 128) this.rows.shift();
    this.rows.push({
      at: p.elapsedMs,
      frames: p.frames,
      packets: p.packets,
      guestTicks: p.guestTicks,
      metadataDelayMs: delay,
    });
  }
  report() {
    const p = this.latest;
    if (!p) return { source: "not-sampled", samplesExported: false };
    return {
      source: "worker-direct-port",
      packets: p.packets,
      frames: p.frames,
      framesPerSecond: p.frames / Math.max(0.001, p.elapsedMs / 1000),
      workerIntervalMeanMs: p.intervalSum / Math.max(1, p.packets - 1),
      workerIntervalMaxMs: p.intervalMax,
      workerProcessingMeanMs: p.processingSum / Math.max(1, p.packets),
      workerProcessingMaxMs: p.processingMax,
      metadataDelayMeanMs: this.delaySum / Math.max(1, this.delays),
      metadataDelayMaxMs: this.delayMax,
      startup: {
        ...p.startup,
        dcMean: p.startup.sum / Math.max(1, p.startup.samples),
        window: "first60s",
      },
      samples: this.rows,
      mainPcmMessages: 0,
      samplesExported: false,
      clockLimit:
        "Metadata delay is not PCM transport latency. Worklet arrival intervals use audio render clock, not Worker wall clock.",
    };
  }
}
