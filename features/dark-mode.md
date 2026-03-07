# Dark Mode

## What it does
Adds dark mode support that defaults to the user's system preference with a manual toggle (system → light → dark cycle). Preference is persisted in InstantDB for signed-in users, localStorage for guests.

## Implementation

### Theme tokens (`globals.css`)
Defined semantic CSS variables in `:root` (light) and `.dark` (dark), wired into Tailwind v4 via `@theme inline`:
- `surface` / `surface-secondary` — backgrounds
- `text-primary` / `text-secondary` / `text-tertiary` — text hierarchy
- `border` / `border-strong` — borders
- `accent` / `accent-text` / `accent-hover` — primary action colors
- `hover` — hover state backgrounds

Removed the `prefers-color-scheme` media query since JS handles system preference.

### Schema (`instant.schema.ts`)
Added `darkMode: i.string().optional()` to `userSettings` entity. Values: `'light'`, `'dark'`, or `''` (system).

### Anti-flash script (`layout.tsx`)
Inline `<script>` in `<head>` reads `localStorage('theme')` and applies `.dark` before first paint. `suppressHydrationWarning` on `<html>`.

### ThemeProvider (`ThemeProvider.tsx`)
Client component providing `useTheme()` context:
- Reads `darkMode` from InstantDB `userSettings` (signed in) or `localStorage` (signed out)
- Falls back to `matchMedia('prefers-color-scheme: dark')`
- Applies `.dark` class on `<html>`, syncs `localStorage` as cache
- Exposes `{ theme, setTheme, resolvedTheme }`

### Toggle in AuthHeader (`components.tsx`)
`ThemeToggle` button with sun/moon/monitor icons. Cycles: system → light → dark.

### Migrated files
Replaced hardcoded light-mode Tailwind classes with semantic equivalents across all UI files:
1. `components.tsx` — shared components
2. `page.tsx` — gallery
3. `new/page.tsx` — drawing page
4. `sketch/[id]/page.tsx` — replay
5. `practice/page.tsx`
6. `user/[handle]/page.tsx`
7. `admin/page.tsx`
8. `debug/templates/page.tsx`
9. `drawing.tsx` — template picker

### Left unchanged
- Canvas drawing colors (pen colors, background colors, stroke rendering)
- Overlays (`bg-black/40`, `bg-white/80`)
- Error/status colors (`text-red-500`, `text-green-500`)
- Slider handles (`bg-slate-500`)
- Focus ring colors (`focus:border-slate-500`)
- Brand colors (`text-stone-500` for "dot")
