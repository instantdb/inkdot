# Fresh Mobile Single Row

## What it does
Keeps the homepage "Fresh off the canvas" sketches in a single row on mobile so the three newest sketches stay visible together, while showing an extra sketch on desktop.

## Implementation
- Inspect the homepage gallery section that renders the fresh sketches
- Add a mobile-specific layout option to the shared sketch grid
- Apply the single-row mobile layout only to the fresh sketches section so the rest of the gallery stays unchanged
- Expand the homepage fresh preview on desktop without breaking the mobile single-row behavior

## Changes after implementation
- Added a `mobileColumns` option to the homepage `SketchGrid`
- Set the "Fresh off the canvas" section to use 3 columns on mobile, which keeps the three newest sketches in a single row
- Left the rest of the gallery grids on the existing 2-column mobile layout
- Increased the fresh query to fetch 4 sketches so desktop can show an extra card
- Hid the extra fresh card on mobile and switched the desktop layout to 4 columns for that section only
