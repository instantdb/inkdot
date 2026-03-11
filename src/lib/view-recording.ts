import { id } from '@instantdb/react';
import { db } from '@/lib/db';

export function recordSketchView({
  sketchId,
  viewerUserId,
  authorUserId,
}: {
  sketchId: string;
  viewerUserId?: string;
  authorUserId?: string;
}) {
  if (viewerUserId && authorUserId && viewerUserId === authorUserId) {
    return Promise.resolve();
  }

  const viewId = id();
  const tx = db.tx.views[viewId]
    .create({ createdAt: Date.now() })
    .link({ sketch: sketchId });

  return db.transact(viewerUserId ? tx.link({ user: viewerUserId }) : tx);
}
