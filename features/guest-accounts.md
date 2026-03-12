# Guest Accounts

## What it does
Makes guest auth the default way into the product, keeps the UI aligned with that guest-first model, and safely migrates guest-owned data onto a full account when someone signs in with email.

## Implementation
- Auto-create a guest session whenever the app loads without a user
- Expose provider-owned guest bootstrap state so the UI can suppress signed-out flashes and route explicit sign-outs back into a fresh guest session
- Hide real-user-only destinations from guests and use a single email-code auth modal for signup/login
- After successful email sign-in, use an admin route to migrate guest-owned sketches and views from any linked guest users onto the full account
- Archive processed guest users by moving them from `linkedGuestUsers` to `migratedGuestUsers`

## Notes
- Instant handles the auth-side guest upgrade and linked-user relationship
- The shared email modal no longer offers a guest option; guest creation only happens automatically via bootstrap or explicit sign-out-to-guest
- The custom merge route handles app data that still points at the guest user id when the destination account already exists

## Changes after implementation
- [src/app/InstantProvider.tsx](/Users/daniel/projects/streamfun/src/app/InstantProvider.tsx) now auto-signs visitors in as guests when no session exists
- [src/app/InstantProvider.tsx](/Users/daniel/projects/streamfun/src/app/InstantProvider.tsx) exposes guest-bootstrap state plus a provider-owned `signOutToGuest()` path
- [src/app/components.tsx](/Users/daniel/projects/streamfun/src/app/components.tsx) suppresses signed-out flashes during guest bootstrap, hides guest-only dead ends, and uses a single shared email-code modal for signup/login
- [src/app/page.tsx](/Users/daniel/projects/streamfun/src/app/page.tsx), [src/app/new/page.tsx](/Users/daniel/projects/streamfun/src/app/new/page.tsx), [src/app/practice/page.tsx](/Users/daniel/projects/streamfun/src/app/practice/page.tsx), and [src/app/upvoted/page.tsx](/Users/daniel/projects/streamfun/src/app/upvoted/page.tsx) treat guest bootstrap as a transient loading state instead of showing signed-out gating
- [src/instant.schema.ts](/Users/daniel/projects/streamfun/src/instant.schema.ts) adds the `migratedGuestUsers` self-link so completed guest migrations are archived separately from still-linked guests
- [src/app/api/auth/merge-linked-guest-data/route.ts](/Users/daniel/projects/streamfun/src/app/api/auth/merge-linked-guest-data/route.ts) relinks guest-owned sketches and views onto the signed-in primary user and moves processed guests to `migratedGuestUsers`
- [src/app/components.tsx](/Users/daniel/projects/streamfun/src/app/components.tsx) calls the merge route after successful `signInWithMagicCode`, so existing-account logins pick up guest-owned sketches and views automatically
