# Keyboard Shortcuts & Click Cursor Improvements

## TODO items addressed
1. Clicks should not show a persistent dot — just change cursor during click
2. Eraser cursor should show a destroy/x icon when over a shape
3. Color keyboard shortcuts: 1-9 for pen colors, Shift+1-9 for bg colors
4. Brush size keyboard shortcuts: 1-4 direct size selection (already have [ ] for prev/next)

## Implementation

### 1. Click event — no persistent dot, just cursor change
- The `click` events are already emitted on pointerDown and rendered as expanding ripples in replay
- The ripples are transient (400ms) — they don't leave a persistent dot
- The issue is likely that the `start` event for pen draws a filled dot at the click point — but that's the actual pen stroke start, not a "click dot"
- On re-read: the click ripples in replay seem fine. The user may mean the drawing page itself. Currently `handlePointerDown` writes a `click` event but nothing visually happens on the drawing canvas from it. The ripple is only during replay. So this might already be working correctly, or the user sees the pen start dot as a "click dot". Since the user specifically said "clicks should not show a persistent dot on the canvas, they should just change the cursor when the click is down" — I think they want a visual cursor press indicator (like a brief press effect) instead of any dot. I'll remove the click ripple from replay and instead just briefly change the cursor overlay to show a pressed state.

Actually re-reading more carefully: "they should just change the cursor when the click is down" — this means during replay, when a click happens, the cursor should show a pressed state (like slightly larger or filled) rather than drawing a ripple on the canvas. Let me replace the canvas ripples with a cursor press indicator.

### 2. Eraser cursor
- When eraser hovers over a shape: use a custom CSS cursor or change to a recognizable delete cursor
- Best option: `not-allowed` or a custom SVG cursor with an X mark
- Going with a custom small X cursor via CSS `url(data:...)` for the eraser-over-shape state

### 3. Color shortcuts
- `1`-`9` selects pen palette color at that index (if it exists)
- `Shift+1` through `Shift+9` selects bg palette color at that index
- Need refs for penPalette and bgPalette since they're derived from settings

### 4. Brush size shortcuts
- Already have `[` and `]` for decrement/increment
- Add `1`-`4` direct selection... wait, that conflicts with color shortcuts
- The user said "do numbers" for colors and something else for sizes
- Looking at the TODO: colors = numbers, sizes = something else
- Since [ ] already work for sizes, I'll keep those. But the TODO says "pencil sizes need keyboard shortcuts" — [ ] already exist. Maybe the user doesn't know? I'll keep [ ] and also add Ctrl+1-4 or similar. Actually, looking at Adobe shortcuts: in Photoshop you use [ ] for brush size which we already have. That should be sufficient. I'll just make sure the tooltips show the shortcuts clearly.

## Changes after implementation
- Replaced canvas ripples in replay with cursor press state (filled dot on CursorOverlay briefly)
- Eraser hover cursor: custom crosshair-x cursor via inline SVG data URL
- Added number key shortcuts for pen colors (1-9) and Shift+number for bg colors
- Brush sizes already have [ ] shortcuts — no additional shortcuts needed, just updated tooltips
- Shift+number on US keyboards produces symbols (!@#$%^&*() — added a mapping table to handle this
- Play/pause button was already correctly implemented (play/pause during playback, replay icon at end)
