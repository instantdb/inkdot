'use client';

import { db } from '@/lib/db';
import { viewerVotesQuery } from '@/lib/sketch-query';
import Link from 'next/link';
import { use } from 'react';
import { AuthHeader, ErrorMsg, SketchCard } from '../../components';

function SignedInUserGallery({ handle }: { handle: string }) {
  const user = db.useUser();
  return <UserGalleryContent handle={handle} user={user} userId={user.id} />;
}

function UserGalleryContent({
  handle,
  user,
  userId,
}: {
  handle: string;
  user?: { id?: string | null; type?: string | null };
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
      ...viewerVotesQuery(user),
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
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="text-text-tertiary hover:text-text-secondary text-xs sm:text-sm"
            >
              &larr; All
            </Link>
            <h2 className="text-text-secondary text-sm sm:text-lg">
              Sketches by{' '}
              <span className="text-text-primary font-semibold">@{handle}</span>
            </h2>
          </div>
          <Link
            href="/new"
            className="bg-accent text-accent-text shadow-border hover:bg-accent-hover rounded-lg px-3 py-1.5 text-sm font-semibold shadow-md transition-all hover:shadow-lg active:scale-95 sm:rounded-xl sm:px-5 sm:py-2 sm:text-base"
          >
            Create Sketch
          </Link>
        </div>

        {sketches.length === 0 ? (
          <div className="text-text-tertiary py-12 text-center sm:py-20">
            <p className="text-text-secondary text-base font-medium sm:text-lg">
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
