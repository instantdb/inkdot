import { init, id } from '@instantdb/admin';
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

  if (!user.email) {
    return NextResponse.json(
      { error: 'Guest users cannot vote' },
      { status: 403 },
    );
  }

  const { sketchId } = (await req.json()) as { sketchId: string };
  if (!sketchId) {
    return NextResponse.json({ error: 'Missing sketchId' }, { status: 400 });
  }

  // Reject self-votes (author's upvote is implicit on the client)
  const { sketches: sketchCheck } = await adminDb.query({
    sketches: { author: {}, $: { where: { id: sketchId } } },
  });
  if (sketchCheck[0]?.author?.id === user.id) {
    return NextResponse.json(
      { error: 'Cannot vote on your own sketch' },
      { status: 403 },
    );
  }

  // Check for existing vote by this user on this sketch
  const { votes } = await adminDb.query({
    votes: {
      $: {
        where: {
          'user.id': user.id,
          'sketch.id': sketchId,
        },
      },
    },
  });

  const existingVote = votes[0];

  if (existingVote) {
    // Remove vote and decrement score
    const { sketches } = await adminDb.query({
      sketches: { $: { where: { id: sketchId } } },
    });
    const currentScore = sketches[0]?.score ?? 0;
    await adminDb.transact([
      adminDb.tx.votes[existingVote.id].delete(),
      adminDb.tx.sketches[sketchId].update({
        score: Math.max(0, currentScore - 1),
      }),
    ]);
    return NextResponse.json({
      voted: false,
      score: Math.max(0, currentScore - 1),
    });
  } else {
    // Create vote and increment score
    const { sketches } = await adminDb.query({
      sketches: { $: { where: { id: sketchId } } },
    });
    const currentScore = sketches[0]?.score ?? 0;
    const voteId = id();
    await adminDb.transact([
      adminDb.tx.votes[voteId]
        .create({ createdAt: Date.now() })
        .link({ sketch: sketchId, user: user.id }),
      adminDb.tx.sketches[sketchId].update({
        score: currentScore + 1,
      }),
    ]);
    return NextResponse.json({ voted: true, score: currentScore + 1 });
  }
}
