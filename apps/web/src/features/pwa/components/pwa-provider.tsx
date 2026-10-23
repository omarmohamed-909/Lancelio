'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface InstallEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
type InstallStatus = 'idle' | 'prompting' | 'accepted' | 'dismissed' | 'failed';
interface PwaState {
  canInstall: boolean;
  installed: boolean;
  installStatus: InstallStatus;
  workerStatus: 'pending' | 'ready' | 'unsupported' | 'failed';
  updateStatus: 'idle' | 'checking' | 'current' | 'waiting' | 'failed';
  install(): Promise<void>;
  checkUpdate(): Promise<void>;
}
const PwaContext = createContext<PwaState | null>(null);

export function PwaProvider({ children }: { children: ReactNode }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [installStatus, setInstallStatus] = useState<InstallStatus>('idle');
  const [registration, setRegistration] =
    useState<ServiceWorkerRegistration | null>(null);
  const [workerStatus, setWorkerStatus] =
    useState<PwaState['workerStatus']>('pending');
  const [updateStatus, setUpdateStatus] =
    useState<PwaState['updateStatus']>('idle');
  const installing = useRef(false);
  useEffect(() => {
    let active = true;
    const mode = matchMedia('(display-mode: standalone)');
    const isInstalled = () =>
      setInstalled(
        mode.matches ||
          Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
      );
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as InstallEvent);
      setInstallStatus('idle');
    };
    const didInstall = () => {
      setInstalled(true);
      setPrompt(null);
      setInstallStatus('idle');
    };
    queueMicrotask(() => {
      if (active) isInstalled();
    });
    mode.addEventListener('change', isInstalled);
    window.addEventListener('beforeinstallprompt', beforeInstall);
    window.addEventListener('appinstalled', didInstall);
    if (
      'serviceWorker' in navigator &&
      window.isSecureContext &&
      process.env.NODE_ENV === 'production'
    ) {
      void navigator.serviceWorker
        .register('/sw.js', { scope: '/', updateViaCache: 'none' })
        .then(async (value) => {
          if (!active) return;
          setRegistration(value);
          if (value.waiting) setUpdateStatus('waiting');
          const candidate = value.installing;
          if (candidate) {
            const onState = () => {
              if (!active) return;
              if (candidate.state === 'redundant' && !value.active)
                setWorkerStatus('failed');
              if (candidate.state === 'activated') setWorkerStatus('ready');
              if (
                candidate.state === 'redundant' ||
                candidate.state === 'activated'
              )
                candidate.removeEventListener('statechange', onState);
            };
            candidate.addEventListener('statechange', onState);
          }
          await navigator.serviceWorker.ready;
          if (active) setWorkerStatus('ready');
        })
        .catch(() => {
          if (active) setWorkerStatus('failed');
        });
    } else
      queueMicrotask(() => {
        if (active) setWorkerStatus('unsupported');
      });
    return () => {
      active = false;
      mode.removeEventListener('change', isInstalled);
      window.removeEventListener('beforeinstallprompt', beforeInstall);
      window.removeEventListener('appinstalled', didInstall);
    };
  }, []);

  async function install() {
    if (!prompt || installed || installing.current) return;
    installing.current = true;
    setInstallStatus('prompting');
    setPrompt(null);
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      setInstallStatus(choice.outcome);
    } catch {
      setInstallStatus('failed');
    } finally {
      installing.current = false;
    }
  }
  async function checkUpdate() {
    if (!registration || updateStatus === 'checking') return;
    setUpdateStatus('checking');
    try {
      await registration.update();
      const candidate = registration.installing;
      if (candidate) {
        await new Promise<void>((resolve) => {
          if (
            candidate.state === 'installed' ||
            candidate.state === 'redundant'
          )
            return resolve();
          const onState = () => {
            if (
              candidate.state === 'installed' ||
              candidate.state === 'redundant'
            ) {
              candidate.removeEventListener('statechange', onState);
              resolve();
            }
          };
          candidate.addEventListener('statechange', onState);
        });
        if (candidate.state === 'redundant')
          throw new Error('Update installation failed');
      }
      setUpdateStatus(registration.waiting ? 'waiting' : 'current');
    } catch {
      setUpdateStatus('failed');
    }
  }
  return (
    <PwaContext.Provider
      value={{
        canInstall: Boolean(prompt),
        installed,
        installStatus,
        workerStatus,
        updateStatus,
        install,
        checkUpdate,
      }}
    >
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const state = useContext(PwaContext);
  if (!state) throw new Error('PwaProvider is required');
  return state;
}
