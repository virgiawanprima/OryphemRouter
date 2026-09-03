const MAX_INTER_CHUNK_GAPS = 32;
function createStreamTiming() {
  const timing = {
    startedAt: Date.now(),
    firstByteAt: null,
    firstForwardAt: null,
    lastForwardAt: null,
    interChunkGaps: [],
    forwardedChunks: 0,
    interrupted: false,
    markByte() {
      if (this.firstByteAt === null) this.firstByteAt = Date.now();
    },
    markForward() {
      const now = Date.now();
      if (this.firstForwardAt === null) this.firstForwardAt = now;
      if (this.lastForwardAt !== null && this.interChunkGaps.length < MAX_INTER_CHUNK_GAPS) {
        this.interChunkGaps.push(now - this.lastForwardAt);
      }
      this.lastForwardAt = now;
      this.forwardedChunks += 1;
    },
    markInterrupted() {
      this.interrupted = true;
    },
    ttftMs() {
      return this.firstForwardAt === null ? null : this.firstForwardAt - this.startedAt;
    },
    avgItlMs() {
      if (this.interChunkGaps.length === 0) return null;
      const sum = this.interChunkGaps.reduce((a, b) => a + b, 0);
      return sum / this.interChunkGaps.length;
    },
    totalMs() {
      return Date.now() - this.startedAt;
    }
  };
  return timing;
}
export {
  createStreamTiming
};
