export function startRecoveryWorker(
  service: { deliverNext(): Promise<boolean> },
  options: { intervalMs?: number; keepAlive?: boolean } = {},
) {
  let inFlight: Promise<unknown> | null = null;
  let stopped = false;
  const timer = setInterval(() => {
    if (stopped || inFlight) return;
    inFlight = Promise.resolve()
      .then(() => service.deliverNext())
      .catch(() => {
        console.error('Recovery queue processing failed; it will retry.');
      })
      .finally(() => {
        inFlight = null;
      });
  }, options.intervalMs ?? 2000);
  if (!options.keepAlive) timer.unref();
  return {
    async stop() {
      stopped = true;
      clearInterval(timer);
      await inFlight;
    },
  };
}
