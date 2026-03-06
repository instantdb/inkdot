# Admin Reports Interface

## Requirements
- Anyone with @instantdb.com email can access /admin
- Shows all reports with frame preview, reason, details, reporter info
- 3 actions per report: Dismiss, Confirm, Confirm + Delete Sketch
- Confirmed reports mark the sketch as `flagged: true`
- Flagged sketches are hidden from everyone except the author (client-side filtering)
- Admin needs to be able to read reports — update perms for @instantdb.com viewers

## Schema Changes
- `sketches`: add `flagged: i.boolean().optional()`
- `reports`: add `status: i.string().optional()` (pending/dismissed/confirmed)

## Permission Changes
- `reports`: view allowed for @instantdb.com emails, all other ops false (admin uses admin SDK)

## Implementation
- `src/app/admin/page.tsx`: Admin page with auth gate, lists reports
- `src/app/api/admin/review/route.ts`: POST route for admin actions
- `src/app/page.tsx`: Filter out flagged sketches unless current user is the author
- `src/app/user/[handle]/page.tsx`: Same filtering
- Schema + perms pushed

## Admin Actions (via API route)
- **Dismiss**: set report status to 'dismissed'
- **Confirm**: set report status to 'confirmed', set sketch.flagged = true
- **Confirm + Delete**: set report status to 'confirmed', delete sketch

## Completed
- All items implemented and pushed
