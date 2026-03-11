import { useSyncExternalStore } from 'react';

type VoteStoreEntry = {
  score: number;
  voted: boolean;
  pending: boolean;
  requestId: number;
};

type VoteStoreSnapshot = Record<string, VoteStoreEntry>;

let nextRequestId = 1;
const listeners = new Set<() => void>();
let snapshot: VoteStoreSnapshot = {};

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(nextSnapshot: VoteStoreSnapshot) {
  snapshot = nextSnapshot;
  emitChange();
}

export function beginOptimisticVote(
  sketchId: string,
  { score, voted }: { score: number; voted: boolean },
) {
  const requestId = nextRequestId++;
  setSnapshot({
    ...snapshot,
    [sketchId]: {
      score,
      voted,
      pending: true,
      requestId,
    },
  });
  return requestId;
}

export function settleOptimisticVote(
  sketchId: string,
  requestId: number,
  { score, voted }: { score: number; voted: boolean },
) {
  const current = snapshot[sketchId];
  if (!current || current.requestId !== requestId) return;

  setSnapshot({
    ...snapshot,
    [sketchId]: {
      score,
      voted,
      pending: false,
      requestId,
    },
  });
}

export function clearOptimisticVote(sketchId: string, requestId?: number) {
  const current = snapshot[sketchId];
  if (!current) return;
  if (requestId != null && current.requestId !== requestId) return;

  const nextSnapshot = { ...snapshot };
  delete nextSnapshot[sketchId];
  setSnapshot(nextSnapshot);
}

export function reconcileOptimisticVotes(
  sketches: Array<{
    id: string;
    score?: number | null;
    votes?: { id: string }[];
  }>,
) {
  let changed = false;
  const nextSnapshot = { ...snapshot };

  for (const sketch of sketches) {
    const current = nextSnapshot[sketch.id];
    if (!current || current.pending) continue;
    if ((sketch.score ?? 0) !== current.score) continue;
    if ((sketch.votes?.length ?? 0) > 0 !== current.voted) continue;
    delete nextSnapshot[sketch.id];
    changed = true;
  }

  if (changed) {
    setSnapshot(nextSnapshot);
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return snapshot;
}

export function useOptimisticVoteScores() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useOptimisticVoteEntry(sketchId: string) {
  return useSyncExternalStore(
    subscribe,
    () => snapshot[sketchId] ?? null,
    () => snapshot[sketchId] ?? null,
  );
}
