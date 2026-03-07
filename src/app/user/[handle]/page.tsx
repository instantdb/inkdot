'use client';

import { db } from '@/lib/db';
import Link from 'next/link';
import { use } from 'react';
import { AuthHeader, ErrorMsg, SketchCard } from '../../components';

function SignedInUserGallery({ handle }: { handle: string }) {
  const user = db.useUser();
  return <UserGalleryContent handle={handle} userId={user.id} />;
}

function UserGalleryContent({
  handle,
  userId,
}: {
  handle: string;
  userId?: string;
}) {
  const { data: settingsData } = db.useQuery(
    userId ? { userSettings: { $: { where: { 'owner.id': userId } } } } : null,
  );
  const userSettings = settingsData?.userSettings?.[0];
  const playbackSpeed = userSettings?.playbackSpeed ?? 2;
  const showCursor = userSettings?.showCursor ?? true;

  const { data } = db.useSuspenseQuery({
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      $: {
        order: { createdAt: 'desc' as const },
        where: { 'author.handle': handle },
      },
    },
  });

  const sketches = data.sketches.filter(
    (s) => !s.flagged || s.author?.id === userId,
  );

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-white font-sans text-gray-800">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/"
            className="text-xs text-gray-400 hover:text-gray-600 sm:text-sm"
          >
            &larr; All
          </Link>
          <h2 className="text-sm text-gray-500 sm:text-lg">
            Sketches by{' '}
            <span className="font-semibold text-gray-800">@{handle}</span>
          </h2>
        </div>

        {sketches.length === 0 ? (
          <div className="py-12 text-center text-gray-400 sm:py-20">
            <p className="text-base font-medium text-gray-500 sm:text-lg">
              No sketches by @{handle}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
            {sketches.map((sketch) => (
              <SketchCard
                key={sketch.id}
                sketch={sketch}
                playbackSpeed={playbackSpeed}
                showCursor={showCursor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function UserPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = use(params);
  const decodedHandle = decodeURIComponent(handle);
  return (
    <>
      <db.SignedIn>
        <SignedInUserGallery handle={decodedHandle} />
      </db.SignedIn>
      <db.SignedOut>
        <UserGalleryContent handle={decodedHandle} />
      </db.SignedOut>
    </>
  );
}
