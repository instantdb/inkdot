import { init } from '@instantdb/admin';
import schema from '@/instant.schema';
import type { Metadata } from 'next';

const adminDb = init({
  appId: process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  adminToken: process.env.INSTANT_APP_ADMIN_TOKEN!,
  schema,
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;

  const { sketches } = await adminDb.query({
    sketches: {
      thumbnail: {},
      $: { where: { id } },
    },
  });

  const sketch = sketches[0];
  const thumbnailUrl = sketch?.thumbnail?.url;

  const title = 'Sketch | InkDot';
  const description = 'Watch this sketch replay as a timelapse on inkdot.';

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: 'InkDot',
      ...(thumbnailUrl && { images: [{ url: thumbnailUrl }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      ...(thumbnailUrl && { images: [thumbnailUrl] }),
    },
  };
}

export default function SketchLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
