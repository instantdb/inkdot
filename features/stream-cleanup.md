# Stream Cleanup: Before-Close Hook & Orphaned Sessions

## TODO items addressed
1. Add a before close hook to close out any open write sessions
2. Add handling for write sessions that never get closed — store original duration, mark as closed if no events

## Implementation

### 1. Before-close hook (beforeunload)
- In `DrawCanvas`, add a `beforeunload` event listener that closes the writer if recording is in progress
- On `beforeunload`: call `writerRef.current?.close()`, update sketch with `durationMs`, upload thumbnail
- Since `beforeunload` is synchronous and we can't await async ops, we'll at minimum close the writer (which is sync)
- Also store `durationMs` on the sketch at recording start so the intended duration is always known

### 2. Orphaned session handling
- Store `duration` (the intended duration in seconds) on the sketch entity at creation time
- On the replay page, if `stream.done === false` and `createdAt + duration * 1000 + buffer` has passed, treat it as done
- Show a "Recording may have been interrupted" message instead of LIVE badge

## Changes after implementation
- Added `beforeunload` listener in DrawCanvas that closes the writer
- Stored `duration` (intended seconds) on sketch at creation
- Replay page: if stream not done but time elapsed > duration + 5s buffer, treat as done and hide LIVE badge
