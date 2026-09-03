// ADAPTATION for OryphemRouter.
// OmniRoute uses the `bottleneck` npm package (v2.19.5) as its rate-limiter engine. That
// dependency is not present in OryphemRouter, so this module provides a minimal
// Bottleneck-compatible shim implementing the subset of the API consumed by
// `rateLimitManager` / `rateLimitManager/wedgeWatchdog` / `bottleneckPatch`:
//
//   constructor(options) · updateSettings · stop · disconnect · schedule
//   currentReservoir · check · counts · running · queued · done · key
//   BottleneckError (static) · Strategies (static)
//
// NOTE: this is a functional in-process FIFO concurrency limiter with reservoir support,
// NOT a full reproduction of Bottleneck's sliding-window/priority/Redis semantics. The
// Bottleneck monkey-patches in `bottleneckPatch.js` will detect no `_run`/`_startHeartbeat`
// and log a "patch skipped" warning, which is harmless.

export class BottleneckError extends Error {
  constructor(message) {
    super(message);
    this.name = "BottleneckError";
  }
}

const Strategies = {
  LEAK: 0,
  OVERFLOW: 1,
  OVERFLOW_PRIORITY: 2,
  BLOCK: 3,
};

let _jobSeq = 0;

export default class Bottleneck {
  constructor(options = {}) {
    this._options = { maxConcurrent: 1, minTime: 0, reservoir: null, ...options };
    this._store = {
      heartbeat: null,
      storeOptions: {
        reservoirRefreshInterval: this._options.reservoirRefreshInterval ?? null,
        reservoirRefreshAmount: this._options.reservoirRefreshAmount ?? null,
        reservoirIncreaseInterval: this._options.reservoirIncreaseInterval ?? null,
        reservoirIncreaseAmount: this._options.reservoirIncreaseAmount ?? null,
      },
      _startHeartbeat: function () {},
    };
    this._running = 0;
    this._queued = [];
    this._done = 0;
    this._executing = 0;
    this._reservoir =
      this._options.reservoir !== undefined && this._options.reservoir !== null
        ? Number(this._options.reservoir)
        : null;
    this._stopped = false;
    this._id = this._options.id ?? `limiter_${++_jobSeq}`;
    this._interval = this._options.minTime > 0 ? this._options.minTime : 0;
    this._lastStart = 0;

    if (this._store.storeOptions.reservoirRefreshInterval != null) {
      const iv = Number(this._store.storeOptions.reservoirRefreshInterval);
      const amount = Number(this._store.storeOptions.reservoirRefreshAmount ?? 0);
      this._store.heartbeat = setInterval(() => {
        if (this._reservoir !== null) this._reservoir = amount;
      }, iv);
      if (this._store.heartbeat && typeof this._store.heartbeat.unref === "function") {
        this._store.heartbeat.unref();
      }
    }
  }

  key() {
    return this._id;
  }

  updateSettings(updates = {}) {
    this._options = { ...this._options, ...updates };
    if (updates.maxConcurrent !== undefined) this._options.maxConcurrent = updates.maxConcurrent;
    if (updates.minTime !== undefined) this._interval = updates.minTime;
    if (updates.reservoir !== undefined) this._reservoir = updates.reservoir;
    if (updates.id !== undefined) this._id = updates.id;
    this._pump();
  }

  counts() {
    return { RUNNING: this._running, QUEUED: this._queued.length, EXECUTING: this._executing, DONE: this._done };
  }

  running() {
    return this._running;
  }

  queued(priority) {
    return this._queued.length;
  }

  done() {
    return this._done;
  }

  check(weight = 1) {
    const canRun = this._running + weight <= (this._options.maxConcurrent ?? 1);
    const hasReservoir = this._reservoir === null || this._reservoir >= weight;
    return Promise.resolve(canRun && hasReservoir);
  }

  currentReservoir() {
    return Promise.resolve(this._reservoir);
  }

  incrementResolutionTime(ms) {
    return Promise.resolve();
  }

  chain(limiter) {
    return Promise.resolve();
  }

  schedule(scheduleOpts, fn) {
    if (typeof scheduleOpts === "function") {
      fn = scheduleOpts;
      scheduleOpts = {};
    }
    const opts = typeof scheduleOpts === "number" ? { weight: scheduleOpts } : (scheduleOpts ?? {});
    const weight = opts.weight ?? 1;
    const priority = opts.priority ?? 5;
    const expiration = opts.expiration ?? this._options.expiration;

    if (this._stopped) {
      return Promise.reject(new BottleneckError("This limiter has been stopped"));
    }

    return new Promise((resolve, reject) => {
      const job = {
        id: opts.id ?? `job_${++_jobSeq}`,
        fn,
        weight,
        priority,
        expiration,
        resolve,
        reject,
        started: false,
      };
      this._queued.push(job);
      this._queued.sort((a, b) => b.priority - a.priority);
      this._pump();
    });
  }

  _pump() {
    while (!this._stopped && this._queued.length > 0) {
      const maxConcurrent = this._options.maxConcurrent ?? 1;
      if (this._running >= maxConcurrent) break;
      const job = this._queued.shift();
      if (this._reservoir !== null && this._reservoir < job.weight) {
        // not enough reservoir capacity — block until refresh
        this._queued.unshift(job);
        break;
      }
      if (this._reservoir !== null) this._reservoir -= job.weight;
      this._start(job);
    }
  }

  _start(job) {
    this._running += job.weight;
    job.started = true;
    const run = async () => {
      try {
        if (this._interval > 0) {
          const wait = Math.max(0, this._lastStart + this._interval - Date.now());
          if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        }
        this._lastStart = Date.now();
        const result = await job.fn();
        job.resolve(result);
      } catch (err) {
        if (job.expiration && err instanceof BottleneckError) job.reject(err);
        else job.reject(err);
      } finally {
        this._running -= job.weight;
        this._done += 1;
        this._pump();
      }
    };

    let timer = null;
    if (job.expiration) {
      timer = setTimeout(() => {
        if (!job.started) {
          const idx = this._queued.indexOf(job);
          if (idx >= 0) this._queued.splice(idx, 1);
          job.reject(new BottleneckError(`This job timed out after ${job.expiration} ms.`));
          this._pump();
        }
      }, job.expiration);
      if (timer && typeof timer.unref === "function") timer.unref();
    }
    void run().then(() => timer && clearTimeout(timer));
  }

  stop(options = {}) {
    if (this._stopped) return Promise.resolve();
    this._stopped = true;
    const dropWaitingJobs = options.dropWaitingJobs ?? false;
    if (dropWaitingJobs) {
      const msg = options.dropErrorMessage ?? "This limiter has been stopped";
      for (const job of this._queued) {
        job.reject(new BottleneckError(msg));
      }
      this._queued = [];
    }
    if (this._store.heartbeat) {
      clearInterval(this._store.heartbeat);
      this._store.heartbeat = null;
    }
    return Promise.resolve();
  }

  disconnect() {
    if (this._store.heartbeat) {
      clearInterval(this._store.heartbeat);
      this._store.heartbeat = null;
    }
  }

  on(event, cb) {
    return this;
  }

  removeAllListeners() {
    return this;
  }
}

Bottleneck.BottleneckError = BottleneckError;
Bottleneck.Strategies = Strategies;
