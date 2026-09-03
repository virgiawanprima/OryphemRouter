class AsyncEventQueue {
  constructor(maxBuffered = 1e4) {
    this.maxBuffered = maxBuffered;
  }
  buffered = [];
  waiters = [];
  closed = false;
  push(value) {
    if (this.closed) return;
    const waiter = this.waiters.shift();
    if (waiter) {
      waiter({ value, done: false });
      return;
    }
    if (this.buffered.length >= this.maxBuffered) throw new Error("Adapter event backlog exceeded");
    this.buffered.push(value);
  }
  close() {
    if (this.closed) return;
    this.closed = true;
    while (this.waiters.length > 0) this.waiters.shift()({ value: void 0, done: true });
  }
  async collect() {
    const values = [];
    for await (const value of this) values.push(value);
    return values;
  }
  [Symbol.asyncIterator]() {
    return {
      next: () => {
        const value = this.buffered.shift();
        if (value !== void 0) return Promise.resolve({ value, done: false });
        if (this.closed) return Promise.resolve({ value: void 0, done: true });
        return new Promise((resolve) => this.waiters.push(resolve));
      },
      return: () => {
        this.close();
        return Promise.resolve({ value: void 0, done: true });
      }
    };
  }
}
export {
  AsyncEventQueue
};
