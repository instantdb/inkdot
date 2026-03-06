# Homepage Explainer Section

## What it does
Adds a subtle "powered by InstantDB & Streams" label next to the inkdot logo in the header, so visitors know what powers the app without a heavy hero section.

## Implementation
Modified `AuthHeader` in `src/app/components.tsx` to wrap the logo link and a new subtitle span in a flex container.

- Text: "powered by InstantDB & Streams"
- "InstantDB" links to `https://instantdb.com`
- "Streams" links to `https://instantdb.com/docs/presence-and-topics`
- Styled in `text-stone-400` at `text-[11px]`, hidden on mobile (`hidden sm:inline`)
- Underline uses `decoration-stone-300` to stay subtle, hover darkens to `stone-600`
