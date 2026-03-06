# Eraser: Delete Whole Shapes

## What it does
Instead of drawing with the background color (old behavior), the eraser tool now deletes entire shapes. When you hover over a shape with the eraser selected, it highlights the shape (same two-pass highlight as the move tool). Clicking deletes it.

## How it works

### New event type: `delete`
- `{ t, x: 0, y: 0, type: 'delete', shapeId: string }`
- Emitted when the user clicks a shape with the eraser tool

### Drawing page (`new/page.tsx`)
- `deletedShapesRef` tracks deleted shapeIds locally
- `findShapeAt` skips shapes in the deleted set
- `handlePointerDown` for eraser: finds shape under cursor, adds to deleted set, emits `delete` event, redraws canvas
- `handlePointerMove` for eraser: hover highlight + pointer cursor when over a deletable shape (reuses `moveHoveredRef` and `drawHighlight`)
- `changeTool`: clears hover state when switching away from eraser (same as move tool)
- `redrawCanvas`: passes `deletedShapesRef.current` to `drawEvent` so deleted shapes are skipped

### Replay page (`sketch/[id]/page.tsx`)
- `redrawUpTo`: builds deleted set with `buildDeletedSet(eventsUpTo)`, passes to `drawEvent`
- Replay frame loop: `delete` events batched with `relocate`/`bg` for redraw (same pattern)
- In-progress shape preview and main event drawing both pass deleted set
- Loop replay: builds offsets + deleted set for the full event list

### Live thumbnail (`components.tsx`)
- `redraw()`: builds deleted set, passes to `drawEvent`, skips `delete` events in the loop
- Event processing: `delete` triggers a full `redraw()` (same as `relocate`)

### Shared (`components.tsx`)
- `buildDeletedSet(events)`: scans for `delete` events, returns `Set<string>` of deleted shapeIds
- `drawEvent`: accepts optional `deleted` parameter, skips events whose `shapeId` is in the set
- `StrokeEvent` type includes `'delete'` in the union

## Changes made
- Removed eraser-as-bg-color-pen logic from `handlePointerMove` (was dead code after eraser returns early from pointerDown)
- Eraser no longer sets `isDrawingRef.current = true`, so no pen strokes are created
