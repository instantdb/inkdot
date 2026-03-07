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
      <h1 className="text-text-primary text-xl font-semibold">Reports</h1>

      {pending.length === 0 && (
        <p className="text-text-tertiary text-sm">No pending reports.</p>
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
          <h2 className="text-text-secondary pt-4 text-lg font-medium">
            Reviewed
          </h2>
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
          ? 'border-border bg-surface'
          : 'border-border bg-surface-secondary opacity-60'
      }`}
    >
      <div className="flex gap-4">
        {/* Frame preview */}
        <div className="w-48 shrink-0">
          {report.frame?.url ? (
            <img
              src={report.frame.url}
              alt="Reported frame"
              className="border-border w-full rounded-lg border"
            />
          ) : (
            <div className="bg-surface-secondary text-text-tertiary flex aspect-[4/3] items-center justify-center rounded-lg text-xs">
              No frame
            </div>
          )}
        </div>

        {/* Details */}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <span className="bg-surface-secondary text-text-secondary inline-block rounded-full px-2 py-0.5 text-xs font-medium">
                {report.reason}
              </span>
              {report.status && (
                <span
                  className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                    report.status === 'confirmed'
                      ? 'bg-red-100 text-red-700'
                      : 'bg-surface-secondary text-text-secondary'
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
            <p className="text-text-secondary text-sm">{report.details}</p>
          )}

          <div className="text-text-tertiary space-y-1.5 text-xs">
            <div>
              <span className="text-text-secondary">Reported by:</span>{' '}
              {report.reporterEmail || 'unknown'} &middot;{' '}
              {new Date(report.createdAt).toLocaleString()}
              <p>
                <span className="text-text-secondary">Reporter IP:</span>{' '}
                {report.reporterIp} &middot; {report.reporterLocation}
              </p>
              <p
                className="truncate"
                title={report.reporterUserAgent ?? undefined}
              >
                <span className="text-text-secondary">Reporter UA:</span>{' '}
                {report.reporterUserAgent}
              </p>
            </div>
            <p>
              <span className="text-text-secondary">Sketch by:</span>{' '}
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
                className="border-border text-text-secondary hover:bg-hover cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
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
                className="text-text-tertiary hover:text-text-secondary cursor-pointer text-xs font-medium underline transition-colors disabled:opacity-50"
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
    <div className="bg-surface text-text-primary flex min-h-screen flex-col items-center font-sans">
      <AuthHeader />
      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="text-text-secondary text-lg">
          Sign in with an @instantdb.com email to continue.
        </p>
        <button
          onClick={() => setShowLogin(true)}
          className="bg-accent text-accent-text hover:bg-accent-hover cursor-pointer rounded-xl px-5 py-2 font-semibold shadow-md transition-all"
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
      <div className="bg-surface text-text-primary flex min-h-screen flex-col items-center font-sans">
        <AuthHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <p className="text-text-secondary text-lg">
            You need an @instantdb.com email to access this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface text-text-primary flex min-h-screen flex-col items-center font-sans">
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
