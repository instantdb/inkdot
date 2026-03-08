# Upvoting

## What it does
Adds upvoting (hearts) to sketches. Users can toggle a vote on any sketch. Votes happen server-side via admin SDK to protect the `score` field. The gallery defaults to ordering by score.

## Implementation

### Schema changes
- `sketches` entity: add `score: i.number().indexed().optional()`
- New `votes` entity: `createdAt: i.number().indexed()`
- Link `voteSketch`: votes has-one sketch, sketches has-many votes
- Link `voteUser`: votes has-one $user, $users has-many votes

### Permissions
- `votes`: view only your own (`auth.id in data.ref('user.id')`), all writes false (admin SDK only)

### Backend API (`/api/vote`)
- POST `{ sketchId }` — toggle vote
- Auth via `adminDb.auth.getUserFromRequest(req)`
- Guest users (no email) get 403
- Toggle: existing vote → delete + decrement score; no vote → create + increment score
- Atomic admin SDK transaction

### UI
- `UpvoteButton` component: heart icon + count, optimistic UI
- Wired into SketchCard overlay and sketch detail action buttons
- Signed-out/guest users see login modal on click

### Query changes
- Gallery: order by `score: 'desc'`, include `votes: {}`
- Sketch detail: include `votes: {}` in query
- User page: include `votes: {}` in query
- Perms filter votes to current user's only → `votes.length > 0` = voted

## Notes
- Perms use `auth.id == data.user` (forward link, no `data.ref` needed)
- Schema/perms pushed to dev only — TODO to push to prod when ready
- Gallery orders by `score: 'desc'` (sketches without scores sort together)
- Compact upvote button on cards, full button on detail page
