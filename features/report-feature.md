# Report Feature

## Requirements
- Only logged-in non-guest users can report
- Hits a backend route that records reporter's IP, location, and metadata
- Admin inserts into a `reports` table not accessible by the client
- Reporter selects a frame with objectionable content
- Create a file with the selected frame and attach it to the report

## Implementation

### Schema
- Add `reports` entity: `createdAt`, `sketchId`, `reporterEmail`, `reporterIp`, `reporterLocation`, `reporterUserAgent`, `reason`
- Link reports to sketch and to a $files (the frame screenshot)
- Permissions: all false for client (admin-only table)

### Backend route
- `POST /api/report` — receives `sketchId`, `reason`, `frameDataUrl` (base64 canvas snapshot)
- Verifies the user is authenticated (non-guest) via Instant auth
- Extracts IP from request headers, geo from IP
- Uploads frame image as a $file via admin SDK
- Creates report entity via admin SDK, links to sketch and frame file

### Client UI
- "Report" button on sketch replay page (only for logged-in non-guest users)
- Opens a modal with:
  - Current frame shown as preview (canvas snapshot at current scrub position)
  - "Scrub to the objectionable frame" instruction with a mini scrubber
  - Reason selector (dropdown or radio: inappropriate, offensive, spam, other)
  - Optional text field for details
  - Submit button
- On submit: captures canvas as dataURL, POSTs to /api/report

## Changes
- `src/instant.schema.ts`: Add reports entity + links
- `src/instant.perms.ts`: Add reports with all-false permissions
- `src/app/api/report/route.ts`: New API route
- `src/app/sketch/[id]/page.tsx`: Report button + modal
