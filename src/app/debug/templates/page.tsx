'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { TEMPLATES } from '../../components';

export default function TemplatesDebugPage() {
  const [search, setSearch] = useState('');
  const [bg, setBg] = useState('#ffffff');
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const filtered = TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.id.toLowerCase().includes(search.toLowerCase()),
  );

  const goPrev = useCallback(() => {
    setLightboxIdx((i) =>
      i !== null ? (i - 1 + filtered.length) % filtered.length : null,
    );
  }, [filtered.length]);

  const goNext = useCallback(() => {
    setLightboxIdx((i) => (i !== null ? (i + 1) % filtered.length : null));
  }, [filtered.length]);

  useEffect(() => {
    if (lightboxIdx === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') setLightboxIdx(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightboxIdx, goPrev, goNext]);

  return (
    <div className="bg-surface-secondary min-h-screen p-8 font-sans">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link
              href="/"
              className="text-text-tertiary hover:text-text-secondary text-sm"
            >
              &larr; Back
            </Link>
            <h1 className="text-text-primary mt-1 text-2xl font-bold">
              Templates ({TEMPLATES.length})
            </h1>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search templates..."
              className="border-border w-64 rounded-lg border px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="text-text-tertiary text-xs">BG:</span>
              {['#ffffff', '#1a1a1a', '#f5f0e8', '#0f172a'].map((c) => (
                <button
                  key={c}
                  onClick={() => setBg(c)}
                  className={`h-7 w-7 rounded-full border-2 transition-all ${
                    bg === c
                      ? 'border-accent scale-110'
                      : 'border-border-strong'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="text-text-tertiary py-20 text-center">
            No templates match &quot;{search}&quot;
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-6 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((tpl, i) => (
              <div key={tpl.id} className="space-y-2">
                <button
                  onClick={() => setLightboxIdx(i)}
                  className="border-border w-full cursor-pointer overflow-hidden rounded-xl border shadow-sm transition-shadow hover:shadow-md"
                  style={{ backgroundColor: bg }}
                >
                  <img
                    src={tpl.src}
                    alt={tpl.name}
                    className="aspect-[4/3] w-full object-contain p-2"
                  />
                </button>
                <div className="flex items-center justify-between px-1">
                  <span className="text-text-secondary text-sm font-medium">
                    {tpl.name}
                  </span>
                  <span className="text-text-tertiary text-xs">{tpl.id}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {lightboxIdx !== null && filtered[lightboxIdx] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setLightboxIdx(null)}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className="absolute left-4 cursor-pointer rounded-full bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div
            className="flex flex-col items-center gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="max-h-[80vh] max-w-[80vw] overflow-hidden rounded-2xl shadow-2xl"
              style={{ backgroundColor: bg }}
            >
              <img
                src={filtered[lightboxIdx].src}
                alt={filtered[lightboxIdx].name}
                className="h-[75vh] w-auto object-contain p-6"
              />
            </div>
            <span className="text-sm font-medium text-white/70">
              {filtered[lightboxIdx].name}
              <span className="ml-2 text-white/40">
                {lightboxIdx + 1}/{filtered.length}
              </span>
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className="absolute right-4 cursor-pointer rounded-full bg-white/10 p-3 text-white/70 transition-colors hover:bg-white/20 hover:text-white"
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
