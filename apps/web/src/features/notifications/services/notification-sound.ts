let context: AudioContext | null = null;

export function enableNotificationSound() {
  // Browser audio must be enabled by a real click or key press. Reuse the
  // context across page navigation instead of allocating one per notification.
  const enable = (event: Event) => {
    if (!event.isTrusted) return;
    try {
      if (!context || context.state === 'closed') context = new AudioContext();
      if (context.state === 'suspended')
        void context.resume().catch(() => undefined);
    } catch {
      // Unsupported or blocked audio must not interfere with notifications.
    }
  };
  document.addEventListener('click', enable, true);
  document.addEventListener('keydown', enable, true);
  return () => {
    document.removeEventListener('click', enable, true);
    document.removeEventListener('keydown', enable, true);
  };
}

export function playNotificationSound() {
  if (!context || context.state !== 'running') return;
  try {
    const start = context.currentTime;
    for (const [offset, frequency] of [
      [0, 880],
      [0.14, 1174.66],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + offset;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
      oscillator.start(at);
      oscillator.stop(at + 0.24);
    }
  } catch {
    // Notification delivery remains available when the device cannot play audio.
  }
}
