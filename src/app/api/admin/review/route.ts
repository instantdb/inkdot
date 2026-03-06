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
  if (!user?.email?.endsWith('@instantdb.com')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { reportId, action, sketchId } = (await req.json()) as {
    reportId: string;
    action: 'dismiss' | 'confirm' | 'confirm_delete' | 'undo';
    sketchId: string;
  };

  if (!reportId || !action) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  if (action === 'dismiss') {
    await adminDb.transact(
      adminDb.tx.reports[reportId].update({ status: 'dismissed' }),
    );
  } else if (action === 'confirm') {
    await adminDb.transact([
      adminDb.tx.reports[reportId].update({ status: 'confirmed' }),
      adminDb.tx.sketches[sketchId].update({ flagged: true }),
    ]);
  } else if (action === 'confirm_delete') {
    await adminDb.transact([
      adminDb.tx.reports[reportId].update({ status: 'confirmed' }),
      adminDb.tx.sketches[sketchId].delete(),
    ]);
  } else if (action === 'undo') {
    await adminDb.transact([
      adminDb.tx.reports[reportId].update({ status: 'pending' }),
      adminDb.tx.sketches[sketchId].update({ flagged: false }),
    ]);
  }

  return NextResponse.json({ ok: true });
}
