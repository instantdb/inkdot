'use client';

import { useEffect, useReducer, useRef } from 'react';

const PREPEND_ANIMATION_MS = 260;

function arraysMatchById(left: { id: string }[], right: { id: string }[]) {
  if (left.length !== right.length) return false;

  for (let index = 0; index < left.length; index += 1) {
    if (left[index]?.id !== right[index]?.id) {
      return false;
    }
  }

  return true;
}

function getPrependedSketchIds(
  previous: { id: string }[],
  next: { id: string }[],
) {
  if (previous.length === 0 || next.length === 0) {
    return [];
  }

  const previousFirstId = previous[0]?.id;
  if (!previousFirstId) {
    return [];
  }

  const insertionIndex = next.findIndex(
    (sketch) => sketch.id === previousFirstId,
  );
  if (insertionIndex <= 0) {
    return [];
  }

  const nextRemainder = next.slice(insertionIndex);
  const previousRemainder = previous.slice(0, nextRemainder.length);
  return arraysMatchById(nextRemainder, previousRemainder)
    ? next.slice(0, insertionIndex).map((sketch) => sketch.id)
    : [];
}

export function usePrependAnimatedSketches<T extends { id: string }>({
  sketches,
  enabled,
}: {
  sketches: T[];
  enabled: boolean;
}) {
  const sketchIds = sketches.map((sketch) => sketch.id);
  const orderSignature = sketchIds.join(':');
  const [state, dispatch] = useReducer(
    (
      currentState: {
        displayedSketchIds: string[];
        enteringSketchIds: string[];
      },
      action:
        | { type: 'sync'; sketchIds: string[] }
        | {
            type: 'animate';
            sketchIds: string[];
            enteringSketchIds: string[];
          }
        | { type: 'clear-entering' },
    ) => {
      switch (action.type) {
        case 'sync':
          return {
            displayedSketchIds: action.sketchIds,
            enteringSketchIds: [],
          };
        case 'animate':
          return {
            displayedSketchIds: action.sketchIds,
            enteringSketchIds: action.enteringSketchIds,
          };
        case 'clear-entering':
          if (currentState.enteringSketchIds.length === 0) {
            return currentState;
          }
          return {
            ...currentState,
            enteringSketchIds: [],
          };
      }
    },
    {
      displayedSketchIds: sketchIds,
      enteringSketchIds: [],
    },
  );
  const displayedSketchIdsRef = useRef(sketchIds);
  const sketchIdsRef = useRef(sketchIds);
  const sketchesRef = useRef(sketches);
  const queuedSketchesRef = useRef<T[] | null>(null);
  const animationTimeoutRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const skipNextAnimationRef = useRef(true);

  useEffect(() => {
    displayedSketchIdsRef.current = state.displayedSketchIds;
  }, [state.displayedSketchIds]);

  useEffect(() => {
    sketchIdsRef.current = sketchIds;
    sketchesRef.current = sketches;
  }, [sketchIds, sketches]);

  useEffect(() => {
    return () => {
      if (animationTimeoutRef.current != null) {
        window.clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const currentSketchIdsInput = sketchIdsRef.current;
    const currentSketchesInput = sketchesRef.current;

    if (!hasInitializedRef.current) {
      hasInitializedRef.current = true;
      skipNextAnimationRef.current = true;
      dispatch({ type: 'sync', sketchIds: currentSketchIdsInput });
      return;
    }

    if (!enabled) {
      if (animationTimeoutRef.current != null) {
        window.clearTimeout(animationTimeoutRef.current);
        animationTimeoutRef.current = null;
      }
      queuedSketchesRef.current = null;
      isAnimatingRef.current = false;
      skipNextAnimationRef.current = true;
      dispatch({ type: 'sync', sketchIds: currentSketchIdsInput });
      return;
    }

    const currentSketchIds = displayedSketchIdsRef.current;
    if (currentSketchIds.length === 0) {
      dispatch({ type: 'sync', sketchIds: currentSketchIdsInput });
      return;
    }

    if (
      arraysMatchById(
        currentSketchIds.map((id) => ({ id })),
        currentSketchIdsInput.map((id) => ({ id })),
      )
    ) {
      return;
    }

    const prependedSketchIds = getPrependedSketchIds(
      currentSketchIds.map((id) => ({ id })),
      currentSketchIdsInput.map((id) => ({ id })),
    );
    if (prependedSketchIds.length === 0) {
      queuedSketchesRef.current = null;
      isAnimatingRef.current = false;
      dispatch({ type: 'sync', sketchIds: currentSketchIdsInput });
      return;
    }

    if (skipNextAnimationRef.current) {
      skipNextAnimationRef.current = false;
      queuedSketchesRef.current = null;
      isAnimatingRef.current = false;
      dispatch({ type: 'sync', sketchIds: currentSketchIdsInput });
      return;
    }

    if (isAnimatingRef.current) {
      queuedSketchesRef.current = currentSketchesInput;
      return;
    }

    isAnimatingRef.current = true;
    dispatch({
      type: 'animate',
      sketchIds: currentSketchIdsInput,
      enteringSketchIds: prependedSketchIds,
    });

    if (animationTimeoutRef.current != null) {
      window.clearTimeout(animationTimeoutRef.current);
    }

    animationTimeoutRef.current = window.setTimeout(() => {
      isAnimatingRef.current = false;
      dispatch({ type: 'clear-entering' });

      if (!queuedSketchesRef.current) {
        return;
      }

      const queuedSketches = queuedSketchesRef.current;
      queuedSketchesRef.current = null;
      const queuedSketchIds = queuedSketches.map((sketch) => sketch.id);

      if (
        arraysMatchById(
          displayedSketchIdsRef.current.map((id) => ({ id })),
          queuedSketchIds.map((id) => ({ id })),
        )
      ) {
        return;
      }

      const queuedPrependedSketchIds = getPrependedSketchIds(
        displayedSketchIdsRef.current.map((id) => ({ id })),
        queuedSketchIds.map((id) => ({ id })),
      );

      if (queuedPrependedSketchIds.length === 0) {
        dispatch({ type: 'sync', sketchIds: queuedSketchIds });
        return;
      }

      isAnimatingRef.current = true;
      dispatch({
        type: 'animate',
        sketchIds: queuedSketchIds,
        enteringSketchIds: queuedPrependedSketchIds,
      });
      animationTimeoutRef.current = window.setTimeout(() => {
        isAnimatingRef.current = false;
        dispatch({ type: 'clear-entering' });
      }, PREPEND_ANIMATION_MS);
    }, PREPEND_ANIMATION_MS);
  }, [enabled, orderSignature]);

  const latestSketchMap = new Map(
    sketches.map((sketch) => [sketch.id, sketch]),
  );
  const displayedSketches = state.displayedSketchIds
    .map((sketchId) => latestSketchMap.get(sketchId))
    .filter((sketch): sketch is T => sketch != null);

  return {
    displayedSketches,
    enteringSketchIds: state.enteringSketchIds,
  };
}
