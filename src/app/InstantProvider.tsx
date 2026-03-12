'use client';

import { db } from '@/lib/db';
import { type User } from '@instantdb/react';
import { InstantSuspenseProvider } from '@instantdb/react/nextjs';
import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const GuestBootstrapContext = createContext({
  isBootstrappingGuest: false,
  signOutToGuest: async () => {},
});

export function useGuestBootstrap() {
  return useContext(GuestBootstrapContext);
}

export function InstantProvider({
  children,
  user,
}: {
  children: React.ReactNode;
  user: User | undefined;
}) {
  const [guestBootstrapFailed, setGuestBootstrapFailed] = useState(false);
  const bootstrapInFlightRef = useRef(false);
  const isBootstrappingGuest = !user && !guestBootstrapFailed;
  const signOutToGuest = async () => {
    setGuestBootstrapFailed(false);
    bootstrapInFlightRef.current = true;

    try {
      await db.auth.signOut();
      await db.auth.signInAsGuest();
    } catch (error) {
      setGuestBootstrapFailed(true);
      throw error;
    } finally {
      bootstrapInFlightRef.current = false;
    }
  };

  useEffect(() => {
    if (!user || !guestBootstrapFailed) {
      return;
    }

    const resetTimer = window.setTimeout(() => {
      setGuestBootstrapFailed(false);
    }, 0);

    return () => window.clearTimeout(resetTimer);
  }, [guestBootstrapFailed, user]);

  useEffect(() => {
    if (user || guestBootstrapFailed || bootstrapInFlightRef.current) {
      return;
    }

    bootstrapInFlightRef.current = true;

    db.auth
      .signInAsGuest()
      .catch(() => {
        setGuestBootstrapFailed(true);
      })
      .finally(() => {
        bootstrapInFlightRef.current = false;
      });
  }, [guestBootstrapFailed, user]);

  const bootstrapValue = useMemo(
    () => ({ isBootstrappingGuest, signOutToGuest }),
    [isBootstrappingGuest],
  );

  return (
    <InstantSuspenseProvider user={user} db={db}>
      <GuestBootstrapContext.Provider value={bootstrapValue}>
        {children}
      </GuestBootstrapContext.Provider>
    </InstantSuspenseProvider>
  );
}
