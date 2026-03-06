# Easy Mode (Trace Templates)

## Problem
Users want an easy way to draw by tracing over an existing image/pattern.

## Solution
"Easy mode" button before starting a sketch opens a template picker with predefined recognizable scenes/memes. Users can also upload their own reference image. The template appears as a faint overlay (20% opacity) on top of the canvas. It's purely visual — not included in the stream, replay, or thumbnail.

## Templates
- `public/templates/this-is-fine.svg` — "This Is Fine" dog meme
- `public/templates/nyan-cat.svg` — Nyan Cat meme

## UI Flow
1. Before starting: "Easy mode" button in pre-start options
2. Click opens template picker panel with thumbnail previews + "Upload your own" option
3. Selecting a template shows it as overlay on canvas, closes picker
4. "Easy mode ✓" shows when active, × button to remove
5. While drawing: checkbox to toggle trace visibility
6. Overlay has `pointer-events: none` so drawing works normally through it

## Files changed
- `src/app/new/page.tsx`: TEMPLATES constant, easy mode picker UI, overlay rendering, toggle
- `public/templates/this-is-fine.svg`: Line-art template
- `public/templates/nyan-cat.svg`: Line-art template
