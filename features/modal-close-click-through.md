# Modal Close Click-Through

## What it does
Fixes the upvote login and upgrade modals so closing them does not trigger the sketch card behind the modal.

## Implementation
- Inspect the shared portal-backed modal components used by `UpvoteButton`
- Stop modal backdrop and close-button clicks from bubbling back into the clickable sketch card
- Keep backdrop-dismiss behavior intact while preventing accidental navigation

## Changes after implementation
- Added shared modal click helpers in `src/app/components.tsx`
- Applied the helpers to both `LoginModal` and `UpgradeModal`
- Backdrop clicks still close the modal, but modal content and the close button now stop propagation so the sketch card link behind the portal is not triggered
