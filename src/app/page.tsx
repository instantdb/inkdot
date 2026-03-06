'use client';

import { db } from '@/lib/db';
import Link from 'next/link';
import {
  AuthHeader,
  LoginModal,
  SketchCard,
  DEFAULT_BG,
} from './components';
import { useState } from 'react';

const PAGE_SIZE = 50;

const createSketchClass =
  'rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold text-white shadow-md shadow-slate-200 transition-all hover:bg-slate-800 hover:shadow-lg hover:shadow-slate-400 active:scale-95 sm:rounded-xl sm:px-5 sm:py-2 sm:text-base';

function CreateSketchButton() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <>
      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} redirectTo="/new" />
      )}
      <button onClick={() => setShowLogin(true)} className={createSketchClass}>
        Create sketch
      </button>
    </>
  );
}

function SignedInGallery() {
  const user = db.useUser();
  return <GalleryContent userId={user.id} isAdmin={!!user.email?.endsWith('@instantdb.com')} />;
}

function GalleryContent({ userId, isAdmin }: { userId?: string; isAdmin?: boolean }) {
  type Cursor = [string, string, unknown, number];
  const [cursors, setCursors] = useState<{
    first?: number;
    after?: Cursor;
    last?: number;
    before?: Cursor;
  }>({ first: PAGE_SIZE });

  const { data, pageInfo } = db.useSuspenseQuery({
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      $: {
        order: { createdAt: 'desc' as const },
        ...cursors,
      },
    },
  });

  const sketches = (data.sketches ?? []).filter(
    (s) => !s.flagged || s.author?.id === userId,
  );

  const endCursor = pageInfo?.sketches?.endCursor as Cursor | undefined;
  const startCursor = pageInfo?.sketches?.startCursor as Cursor | undefined;
  const hasNext = pageInfo?.sketches?.hasNextPage ?? false;
  const hasPrev = pageInfo?.sketches?.hasPreviousPage ?? false;

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-white font-sans text-gray-800">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <div className="flex items-center justify-between">
          <div />
          <db.SignedIn>
            <Link href="/new" className={createSketchClass}>
              Create sketch
            </Link>
          </db.SignedIn>
          <db.SignedOut>
            <CreateSketchButton />
          </db.SignedOut>
        </div>

        {sketches.length === 0 && !hasPrev ? (
          <div className="py-12 text-center text-gray-400 sm:py-20">
            <p className="mb-4 text-5xl sm:text-6xl">🎨</p>
            <p className="text-base font-medium text-gray-500 sm:text-lg">
              No sketches yet
            </p>
            <p className="mt-2 text-sm">
              Click &quot;Create sketch&quot; to create your first one!
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-3">
              {sketches.map((sketch) => (
                <SketchCard
                  key={sketch.id}
                  sketch={sketch}
                  isAdmin={!!isAdmin}
                />
              ))}
            </div>
            {(hasPrev || hasNext) && (
              <div className="flex items-center justify-center gap-3 pb-4">
                <button
                  onClick={() => {
                    if (startCursor) {
                      setCursors({ before: startCursor, last: PAGE_SIZE });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  disabled={!hasPrev}
                  className="cursor-pointer rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  Previous
                </button>
                <button
                  onClick={() => {
                    if (endCursor) {
                      setCursors({ after: endCursor, first: PAGE_SIZE });
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                  }}
                  disabled={!hasNext}
                  className="cursor-pointer rounded-lg border border-slate-300 px-4 py-1.5 text-sm font-medium text-slate-700 transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function GalleryPage() {
  return (
    <>
      <db.SignedIn>
        <SignedInGallery />
      </db.SignedIn>
      <db.SignedOut>
        <GalleryContent />
      </db.SignedOut>
    </>
  );
}
