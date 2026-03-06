# Delete Own Sketches

## Problem
Users can't delete their own sketches.

## Solution
- Add a delete button on the sketch replay page, visible only to the author
- Show a confirmation before deleting
- On delete, remove the sketch entity and navigate back to gallery
- Tighten sketch permissions: only the author can update/delete

## Changes
- `src/app/sketch/[id]/page.tsx`: Add delete button + confirmation in the top bar (next to Back)
- `src/instant.perms.ts`: Lock down sketch update/delete to author only
