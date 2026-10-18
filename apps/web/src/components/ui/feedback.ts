'use client';

type Confirmation = { message: string; resolve: (accepted: boolean) => void };
type Toast = { id: number; message: string; announce: boolean };
type Feedback = { confirmation: Confirmation | null; toast: Toast | null };
const empty: Feedback = { confirmation: null, toast: null };
let state = empty;
let sequence = 0;
const listeners = new Set<() => void>();
const approvedLinks = new WeakSet<HTMLAnchorElement>();

function publish(next: Feedback) {
  state = next;
  listeners.forEach((listener) => listener());
}

export const feedbackStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  snapshot: () => state,
  serverSnapshot: () => empty,
};

export function confirmAction(message: string): Promise<boolean> {
  if (state.confirmation) return Promise.resolve(false);
  return new Promise((resolve) =>
    publish({ ...state, confirmation: { message, resolve } }),
  );
}

export function confirmNavigation(
  event: { currentTarget: HTMLAnchorElement; preventDefault: () => void },
  message: string,
) {
  const anchor = event.currentTarget;
  if (approvedLinks.delete(anchor)) return;
  event.preventDefault();
  void confirmAction(message).then((accepted) => {
    if (accepted && anchor.isConnected) {
      approvedLinks.add(anchor);
      anchor.click();
    }
  });
}

export function answerConfirmation(accepted: boolean) {
  const request = state.confirmation;
  if (!request) return;
  publish({ ...state, confirmation: null });
  request.resolve(accepted);
}

export function notifySuccess(message: string, announce = false) {
  publish({ ...state, toast: { id: ++sequence, message, announce } });
}

export function dismissSuccess(id: number) {
  if (state.toast?.id === id) publish({ ...state, toast: null });
}
