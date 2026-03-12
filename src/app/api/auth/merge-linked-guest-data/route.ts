import { init } from '@instantdb/admin';
import schema from '@/instant.schema';
import { NextRequest, NextResponse } from 'next/server';

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

export async function POST(req: NextRequest) {
  const user = await adminDb.auth.getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.type !== 'user') {
    return NextResponse.json(
      { error: 'Only full users can merge linked guest data' },
      { status: 400 },
    );
  }

  const { $users } = await adminDb.query({
    $users: {
      linkedGuestUsers: {
        sketches: {},
        views: {},
      },
      $: { where: { id: user.id } },
    },
  });

  const primaryUser = $users[0];
  const linkedGuestUsers = primaryUser?.linkedGuestUsers ?? [];

  const txs = linkedGuestUsers.flatMap((guestUser) => [
    adminDb.tx.$users[guestUser.id]
      .unlink({ linkedPrimaryUser: user.id })
      .link({ migratedPrimaryUser: user.id }),
    ...(guestUser.sketches ?? []).map((sketch) =>
      adminDb.tx.sketches[sketch.id].link({ author: user.id }),
    ),
    ...(guestUser.views ?? []).map((view) =>
      adminDb.tx.views[view.id].link({ user: user.id }),
    ),
  ]);

  if (txs.length > 0) {
    await adminDb.transact(txs);
  }

  const migratedSketchCount = linkedGuestUsers.reduce(
    (count, guestUser) => count + (guestUser.sketches?.length ?? 0),
    0,
  );
  const migratedViewCount = linkedGuestUsers.reduce(
    (count, guestUser) => count + (guestUser.views?.length ?? 0),
    0,
  );

  return NextResponse.json({
    linkedGuestCount: linkedGuestUsers.length,
    migratedGuestCount: linkedGuestUsers.length,
    migratedSketchCount,
    migratedViewCount,
  });
}
