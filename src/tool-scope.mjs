/** An owner's admitted tool calls must settle before its private ledger closes. */
export function createToolScope({ closedError = () => new Error('tool_scope_closed'), abortedError = () => new Error('tool_call_aborted') } = {}) {
  const controller = new AbortController(), pending = new Set();
  let closed = false, closing;
  return Object.freeze({
    run(task, callerSignal) {
      if (closed) return Promise.reject(closedError());
      const signal = callerSignal instanceof AbortSignal
        ? AbortSignal.any([controller.signal, callerSignal]) : controller.signal;
      const operation = Promise.resolve().then(() => {
        if (closed) throw closedError();
        if (signal.aborted) throw abortedError();
        return task(signal);
      });
      pending.add(operation);
      void operation.then(() => pending.delete(operation), () => pending.delete(operation));
      return operation;
    },
    close() {
      if (closing) return closing;
      closed = true; controller.abort();
      closing = Promise.allSettled([...pending]).then(() => {});
      return closing;
    },
  });
}
