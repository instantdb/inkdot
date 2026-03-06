import { init, id, lookup } from '@instantdb/admin';
import schema from '@/instant.schema';
import { NextRequest, NextResponse } from 'next/server';

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

export async function POST(req: NextRequest) {
  // Verify auth via cookie
  const user = await adminDb.auth.getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Guest users don't have email — only allow non-guest
  if (!user.email) {
    return NextResponse.json(
      { error: 'Guest users cannot report' },
      { status: 403 },
    );
  }

  const body = await req.json();
  const { sketchId, reason, details, frameDataUrl } = body as {
    sketchId: string;
    reason: string;
    details?: string;
    frameDataUrl: string;
  };

  if (!sketchId || !reason || !frameDataUrl) {
    return NextResponse.json(
      { error: 'Missing required fields' },
      { status: 400 },
    );
  }

  // Extract metadata
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';

  // Try to get location from IP via free API
  let location = 'unknown';
  try {
    const geoRes = await fetch(`https://ipapi.co/${ip}/json/`, {
      signal: AbortSignal.timeout(3000),
    });
    if (geoRes.ok) {
      const geo = await geoRes.json();
      if (geo.city && geo.country_name) {
        location = `${geo.city}, ${geo.region}, ${geo.country_name}`;
      }
    }
  } catch {
    // Geo lookup is best-effort
  }

  // Upload frame screenshot
  const base64Data = frameDataUrl.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  const fileName = `report-${sketchId}-${Date.now()}.png`;

  let uploaded = false;
  try {
    await adminDb.storage.uploadFile(fileName, buffer);
    uploaded = true;
  } catch {
    // File upload is best-effort — still create report
  }

  // Create report via admin SDK
  const reportId = id();
  const tx = adminDb.tx.reports[reportId].update({
    createdAt: Date.now(),
    sketchId,
    reporterEmail: user.email,
    reporterIp: ip,
    reporterLocation: location,
    reporterUserAgent: userAgent,
    reason,
    details: details || undefined,
  });

  if (uploaded) {
    await adminDb.transact(tx.link({ frame: lookup('path', fileName) }));
  } else {
    await adminDb.transact(tx);
  }

  return NextResponse.json({ ok: true });
}
