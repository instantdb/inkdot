'use client';

import Link from 'next/link';
import { AuthHeader } from '../components';
import { BrowsePageHeader } from '../BrowsePageHeader';
import { StreamsDiagram } from './StreamsDiagram';

export default function AboutPage() {
  return (
    <div className="bg-surface text-text-primary flex min-h-[100dvh] flex-col items-center font-sans">
      <AuthHeader />
      <div className="w-full max-w-4xl space-y-4 px-3 py-3 sm:space-y-8 sm:p-6">
        <BrowsePageHeader label="Info" title="About" />

        <div className="space-y-6 sm:space-y-8">
          <section className="space-y-2">
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              Inkdot is a real-time collaborative drawing app. Draw a sketch,
              and every brushstroke is streamed live for others to watch.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-text-primary text-base font-semibold sm:text-lg">
              Built with
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              Inkdot is powered by{' '}
              <a
                href="https://instantdb.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary decoration-border-strong hover:decoration-text-primary font-medium underline underline-offset-2"
              >
                InstantDB
              </a>{' '}
              and{' '}
              <a
                href="https://instantdb.com/docs/streams"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary decoration-border-strong hover:decoration-text-primary font-medium underline underline-offset-2"
              >
                Streams
              </a>
              . Queries, auth, votes, and sketches are all real-time via
              InstantDB. The live drawing uses Instant Streams to broadcast
              brushstrokes with zero persistence overhead.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              Instant streams never expire, so you can stream after they&apos;re
              done to replay sketches.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              They were built to stream llm-generated responses to clients.
              There are a few examples of a{' '}
              <a
                href="https://github.com/instantdb/instant/tree/main/examples/vercel-ai-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary decoration-border-strong hover:decoration-text-primary font-medium underline underline-offset-2"
              >
                one-shot AI app builder
              </a>{' '}
              and an{' '}
              <a
                href="https://github.com/instantdb/instant/tree/main/examples/vercel-ai-sdk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary decoration-border-strong hover:decoration-text-primary font-medium underline underline-offset-2"
              >
                AI chat app
              </a>{' '}
              if you want to see how to use streams in your llm-powered apps.
              Instant also publishes a{' '}
              <a
                href="https://npmjs.com/package/@instantdb/resumable-stream"
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-primary decoration-border-strong hover:decoration-text-primary font-medium underline underline-offset-2"
              >
                resumable-stream
              </a>{' '}
              package that is a drop-in replacement for Vercel&apos;s
              resumable-streams package. Your streams never expire and you
              don&apos;t need to add Redis to your app.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-text-primary text-base font-semibold sm:text-lg">
              How Streams Work
            </h2>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              The writer pushes data to Instant over a websocket and Instant
              immediately distributes those writes to every listener of the
              stream through the listener&apos;s websocket or sse connections.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              As the stream grows, Instant flushes the writes to Instant Storage
              (backed by S3). When a new client connects, it fetches the chunks
              from S3 and subscribes to new writes. The new writes are delivered
              directly from the Instant server.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              When the writer is finished, all writes are flushed to Storage and
              the stream is marked as done.
            </p>
            <p className="text-text-secondary text-sm leading-relaxed sm:text-base">
              This approach has very low overhead for delivering fresh writes,
              but allows the streams to grow beyond what could safely fit in
              memory.
            </p>
            <StreamsDiagram />
          </section>
        </div>
      </div>
    </div>
  );
}
