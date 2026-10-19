'use client';

import { useEffect, useState } from 'react';
import {
  SessionProvider,
  useSession,
} from '../../auth/components/session-provider';
import { LandingPage } from './landing-page';

function ReturningLanding() {
  const { snapshot } = useSession();
  // Keep a workspace entrance while the existing cookie is being verified.
  // An expired session returns to visitor actions after the API rejects it.
  return <LandingPage returning={snapshot.status !== 'anonymous'} />;
}

export function LandingEntry({
  hasSessionCookie,
}: {
  hasSessionCookie: boolean;
}) {
  const [checkSession, setCheckSession] = useState(hasSessionCookie);
  useEffect(() => {
    if (!('BroadcastChannel' in window)) return;
    const channel = new BroadcastChannel('lancelio-session');
    channel.onmessage = (event: MessageEvent<unknown>) => {
      if (event.data === 'signed-in') setCheckSession(true);
      else if (
        event.data === 'signed-out' ||
        event.data === 'password-changed' ||
        event.data === 'password-change-unconfirmed'
      )
        setCheckSession(false);
    };
    return () => channel.close();
  }, []);
  return checkSession ? (
    <SessionProvider>
      <ReturningLanding />
    </SessionProvider>
  ) : (
    <LandingPage />
  );
}
