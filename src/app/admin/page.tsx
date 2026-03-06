'use client';

import { db } from '@/lib/db';
import { useState } from 'react';
import { AuthHeader, LoginModal } from '../components';

function AdminContent() {
  const { data } = db.useSuspenseQuery({
    reports: {
      frame: {},
      $: { order: { createdAt: 'desc' as const } },
    },
    sketches: {
      author: {},
    },
  });

  const reports = data.reports;
  const sketchMap = new Map(data.sketches.map((s) => [s.id, s]));
  const pending = reports.filter((r) => !r.status || r.status === 'pending');
  const reviewed = reports.filter((r) => r.status && r.status !== 'pending');

  return (
    <div className="w-full max-w-4xl space-y-6 p-6">
      <h1 className="text-xl font-semibold text-gray-800">Reports</h1>

      {pending.length === 0 && (
        <p className="text-sm text-gray-400">No pending reports.</p>
      )}

      {pending.map((report) => (
        <ReportCard
          key={report.id}
          report={report}
          sketch={sketchMap.get(report.sketchId)}
        />
      ))}

      {reviewed.length > 0 && (
        <>
          <h2 className="pt-4 text-lg font-medium text-gray-500">Reviewed</h2>
          {reviewed.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              sketch={sketchMap.get(report.sketchId)}
            />
          ))}
        </>
      )}
    </div>
  );
}

function ReportCard({
  report,
  sketch,
}: {
  report: {
    id: string;
    createdAt: number;
    sketchId: string;
    reporterEmail?: string | null;
    reporterIp?: string | null;
    reporterLocation?: string | null;
    reporterUserAgent?: string | null;
    reason: string;
    details?: string | null;
    status?: string | null;
    frame?: { url: string };
  };
  sketch?: { author?: { email?: string | null; handle?: string | null } };
}) {
  const [acting, setActing] = useState<string | null>(null);

  const isPending = !report.status || report.status === 'pending';

  const callAction = async (action: string) => {
    setActing(action);
    try {
      await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: report.id,
          action,
          sketchId: report.sketchId,
        }),
      });
    } finally {
      setActing(null);
    }
  };

  return (
    <div
      className={`overflow-hidden rounded-xl border p-4 ${
        isPending
          ? 'border-gray-200 bg-white'
          : 'border-gray-100 bg-gray-50 opacity-60'
      }`}
    >
      <div className="flex gap-4">
        {/* Frame preview */}
        <div className="w-48 shrink-0">
          {report.frame?.url ? (
            <img
              src={report.frame.url}
              alt="Reported frame"
              className="w-full rounded-lg border border-gray-200"
            />
          ) : (
            <div className="flex aspect-[4/3] items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-400">
              No frame
            </div>
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                {report.reason}
              </span>
              {report.status && (
                <span
                  className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    report.status === 'confirmed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {report.status}
                </span>
              )}
            </div>
            <a
              href={`/sketch/${report.sketchId}`}
              target="_blank"
              className="shrink-0 text-xs text-blue-500 hover:underline"
            >
              View sketch
            </a>
          </div>

          {report.details && (
            <p className="text-sm text-gray-600">{report.details}</p>
          )}

          <div className="space-y-1.5 text-xs text-gray-400">
            <div>
              <span className="text-gray-500">Reported by:</span>{' '}
              {report.reporterEmail || 'unknown'} &middot;{' '}
              {new Date(report.createdAt).toLocaleString()}
              <p>
                <span className="text-gray-500">Reporter IP:</span>{' '}
                {report.reporterIp} &middot; {report.reporterLocation}
              </p>
              <p
                className="truncate"
                title={report.reporterUserAgent ?? undefined}
              >
                <span className="text-gray-500">Reporter UA:</span>{' '}
                {report.reporterUserAgent}
              </p>
            </div>
            <p>
              <span className="text-gray-500">Sketch by:</span>{' '}
              {sketch?.author?.handle
                ? `@${sketch.author.handle}`
                : sketch?.author?.email || 'unknown'}
            </p>
          </div>

          {/* Actions */}
          {isPending && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => callAction('dismiss')}
                disabled={!!acting}
                className="cursor-pointer rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                {acting === 'dismiss' ? 'Dismissing...' : 'Dismiss'}
              </button>
              <button
                onClick={() => callAction('confirm')}
                disabled={!!acting}
                title="Confirms the report and hides the sketch from everyone except the author"
                className="cursor-pointer rounded-lg border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:opacity-50"
              >
                {acting === 'confirm' ? 'Confirming...' : 'Confirm & flag'}
              </button>
              <button
                onClick={() => callAction('confirm_delete')}
                disabled={!!acting}
                className="cursor-pointer rounded-lg bg-red-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
              >
                {acting === 'confirm_delete'
                  ? 'Deleting...'
                  : 'Confirm & delete'}
              </button>
            </div>
          )}

          {!isPending && (
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => callAction('undo')}
                disabled={!!acting}
                className="cursor-pointer text-xs font-medium text-gray-400 underline transition-colors hover:text-gray-600 disabled:opacity-50"
              >
                {acting === 'undo' ? 'Undoing...' : 'Undo'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignedOutAdmin() {
  const [showLogin, setShowLogin] = useState(false);
  return (
    <div className="flex min-h-screen flex-col items-center bg-white font-sans text-gray-800">
      <AuthHeader />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-lg text-gray-500">
          Sign in with an @instantdb.com email to continue.
        </p>
        <button
          onClick={() => setShowLogin(true)}
          className="cursor-pointer rounded-xl bg-slate-700 px-5 py-2 font-semibold text-white shadow-md transition-all hover:bg-slate-800"
        >
          Sign in
        </button>
      </div>
    </div>
  );
}

function SignedInAdmin() {
  const user = db.useUser();

  if (!user.email?.endsWith('@instantdb.com')) {
    return (
      <div className="flex min-h-screen flex-col items-center bg-white font-sans text-gray-800">
        <AuthHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-lg text-gray-500">
            You need an @instantdb.com email to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-white font-sans text-gray-800">
      <AuthHeader />
      <AdminContent />
    </div>
  );
}

export default function AdminPage() {
  return (
    <>
      <db.SignedOut>
        <SignedOutAdmin />
      </db.SignedOut>
      <db.SignedIn>
        <SignedInAdmin />
      </db.SignedIn>
    </>
  );
}
