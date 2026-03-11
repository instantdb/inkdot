# View Recording

## What it does
Records a `view` each time a sketch playback fully finishes, optionally linked to the signed-in user who watched it.

## Implementation
- Add a `views` entity and links to `sketches` and `$users`
- Record views directly from the replay client with a transact, optionally linking the current user
- Trigger the write from the sketch replay player only when a run actually reaches the end
- Reset the per-run guard on replay so repeated full watches are recorded

## Changes after implementation
- Added `views` plus `viewSketch` and `viewUser` in `src/instant.schema.ts`
- Allowed direct `views.create` in `src/instant.perms.ts`, but only when signed-out clients create anonymous views or signed-in clients link the view to themselves
- `ReplayCanvas` now records a view when playback reaches the end, links it to the current sketch, and links it to the authenticated user when present, but skips author self-views
- `ReplayThumbnail` now records a view too when the thumbnail replay fully finishes, and also skips author self-views
- Replay resets the per-run guard, and loop mode records each completed loop once
