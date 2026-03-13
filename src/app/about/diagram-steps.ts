import {
  type Step,
  PARTICLE_PX_SPEED,
  edgeGeo,
  edgeGrowDurationS,
  edgeLength,
} from './diagram-data';

export const STEPS: Step[] = [
  {
    title: 'Streams',
    description:
      'Streams are the backbone of inkdot. Every sketch is a stream of drawing actions that can be written, read, stored, and replayed in real time.',
    activeNodes: [],
    activeEdges: [],
    dimNodes: [
      'writer',
      'instant1',
      'instant2',
      'instant3',
      'storage',
      'readerA',
      'readerB',
      'readerC',
    ],
  },
  {
    title: 'Writer starts streaming',
    description:
      'The artist begins drawing. Actions on the canvas are written to a WritableStream, which pushes them to an Instant server over a websocket or SSE connection.',
    activeNodes: ['writer', 'instant2'],
    activeEdges: [{ from: 'writer', to: 'instant2', grow: true }],
    dimNodes: [
      'instant1',
      'instant3',
      'storage',
      'readerA',
      'readerB',
      'readerC',
    ],
  },
  {
    title: 'Live readers connect',
    description:
      'Readers connect to their nearest Instant servers. Data is forwarded internally between servers so every reader gets the stream.',
    activeNodes: [
      'writer',
      'instant1',
      'instant2',
      'instant3',
      'readerA',
      'readerB',
    ],
    activeEdges: (() => {
      const readerGrow = Math.max(
        edgeGrowDurationS({ from: 'readerA', to: 'instant1' }),
        edgeGrowDurationS({ from: 'readerB', to: 'instant3' }),
      );
      const serverGrow =
        readerGrow +
        Math.max(
          edgeGrowDurationS({ from: 'instant1', to: 'instant2' }),
          edgeGrowDurationS({ from: 'instant3', to: 'instant2' }),
        );
      return [
        { from: 'writer', to: 'instant2' },
        {
          from: 'readerA',
          to: 'instant1',
          grow: true,
          stream: false,
          autoExit: serverGrow,
        },
        {
          from: 'readerB',
          to: 'instant3',
          grow: true,
          stream: false,
          autoExit: serverGrow,
        },
        {
          from: 'instant1',
          to: 'instant2',
          grow: true,
          stream: false,
          enterDelay: readerGrow,
          autoExit: serverGrow,
        },
        {
          from: 'instant3',
          to: 'instant2',
          grow: true,
          stream: false,
          enterDelay: readerGrow,
          autoExit: serverGrow,
        },
        { from: 'instant2', to: 'instant1', enterDelay: serverGrow },
        { from: 'instant1', to: 'readerA', enterDelay: serverGrow },
        { from: 'instant2', to: 'instant3', enterDelay: serverGrow },
        { from: 'instant3', to: 'readerB', enterDelay: serverGrow },
      ];
    })(),
    dimNodes: ['storage', 'readerC'],
  },
  {
    title: 'Flush to storage',
    description:
      'As the stream grows, Instant flushes buffered writes to S3. This keeps server memory low while preserving the full stream.',
    activeNodes: [
      'writer',
      'instant1',
      'instant2',
      'instant3',
      'storage',
      'readerA',
      'readerB',
    ],
    activeEdges: [
      { from: 'writer', to: 'instant2' },
      { from: 'instant2', to: 'storage', flush: 8 },
      { from: 'instant2', to: 'instant1', dim: true },
      { from: 'instant1', to: 'readerA', dim: true },
      { from: 'instant2', to: 'instant3', dim: true },
      { from: 'instant3', to: 'readerB', dim: true },
    ],
    dimNodes: ['instant1', 'instant3', 'readerA', 'readerB', 'readerC'],
  },
  {
    title: 'Late reader catches up',
    description:
      'Reader C joins late and connects to a nearby server. The server tells it which chunks to fetch from S3, then subscribes to live writes.',
    activeNodes: ['writer', 'instant2', 'instant3', 'storage', 'readerC'],
    activeEdges: (() => {
      // Phase 0: Reader C connects to instant3
      const connectGrow = edgeGrowDurationS({
        from: 'readerC',
        to: 'instant3',
      });
      // Phase 1: S3 fetch + live stream start simultaneously
      const fetchGrow =
        connectGrow + edgeGrowDurationS({ from: 'storage', to: 'readerC' });
      return [
        // Writer keeps streaming the whole time
        { from: 'writer', to: 'instant2' },
        // Phase 0: Reader C → instant3 (grow, bidi, no particles)
        {
          from: 'readerC',
          to: 'instant3',
          grow: true,
          stream: false,
          bidi: true,
        },
        // Phase 1a: S3 → Reader C (grow, then stream stored particles)
        {
          from: 'storage',
          to: 'readerC',
          grow: true,
          stream: false,
          enterDelay: connectGrow,
          autoExit: fetchGrow,
        },
        {
          from: 'storage',
          to: 'readerC',
          enterDelay: fetchGrow,
          shrink: true,
          shrinkDelay: fetchGrow,
          shrinkToward: 'to',
        },
        // Phase 1b: live writes forwarded through servers (simultaneous)
        { from: 'instant2', to: 'instant3', enterDelay: connectGrow },
        {
          from: 'instant3',
          to: 'readerC',
          enterDelay: connectGrow,
          sendOffsetNode: 'storage',
        },
        // Keep reader A/B pipes active but dimmed
        { from: 'instant2', to: 'instant1', dim: true },
        { from: 'instant1', to: 'readerA', dim: true },
        { from: 'instant3', to: 'readerB', dim: true },
      ];
    })(),
    dimNodes: ['instant1', 'readerA', 'readerB'],
  },
  {
    title: 'Writer finishes',
    description:
      'The artist saves. All remaining writes flush to S3 and the stream is marked done.',
    activeNodes: ['writer', 'instant2', 'storage'],
    dimNodes: ['instant1', 'instant3', 'readerA', 'readerB', 'readerC'],
    activeEdges: (() => {
      // Writer sends last particle, then connection shrinks chasing it
      const writerGeo = edgeGeo({ from: 'writer', to: 'instant2' });
      const writerTravel = edgeLength(writerGeo) / PARTICLE_PX_SPEED;
      // Shrink starts immediately — at particle speed it takes exactly writerTravel
      const writerShrinkStart = 0;

      // After last writer particle arrives at server, flush everything
      const flushStart = writerTravel;

      // Travel times for inter-server hops
      const i2i1Travel =
        edgeLength(edgeGeo({ from: 'instant2', to: 'instant1' })) /
        PARTICLE_PX_SPEED;
      const i2i3Travel =
        edgeLength(edgeGeo({ from: 'instant2', to: 'instant3' })) /
        PARTICLE_PX_SPEED;

      // Shrink starts when last particle spawns on each edge
      // (shrink duration = particle travel time, so they finish together)
      const i2i1ShrinkStart = flushStart;
      const i2i3ShrinkStart = flushStart;
      const raShrinkStart = flushStart + i2i1Travel;
      const rbShrinkStart = flushStart + i2i3Travel;
      const rcShrinkStart = flushStart + i2i3Travel;
      const s3ShrinkStart = flushStart;

      return [
        // Writer edge shrinks from the start, chasing last particles from step 4
        {
          from: 'writer',
          to: 'instant2',
          stream: false,
          shrink: true,
          shrinkDelay: writerShrinkStart,
        },
        // Flush remaining to S3 after last writer particle arrives, then shrink
        {
          from: 'instant2',
          to: 'storage',
          enterDelay: flushStart,
          shrink: true,
          shrinkDelay: s3ShrinkStart,
        },
        // Forward to readers through servers (dim, shrink after last particle)
        {
          from: 'instant2',
          to: 'instant1',
          dim: true,
          shrink: true,
          shrinkDelay: i2i1ShrinkStart,
        },
        {
          from: 'instant1',
          to: 'readerA',
          dim: true,
          shrink: true,
          shrinkDelay: raShrinkStart,
        },
        {
          from: 'instant2',
          to: 'instant3',
          dim: true,
          shrink: true,
          shrinkDelay: i2i3ShrinkStart,
        },
        {
          from: 'instant3',
          to: 'readerB',
          dim: true,
          shrink: true,
          shrinkDelay: rbShrinkStart,
        },
        {
          from: 'instant3',
          to: 'readerC',
          dim: true,
          shrink: true,
          shrinkDelay: rcShrinkStart,
        },
      ];
    })(),
  },
  {
    title: 'Replay',
    description:
      'A reader connects to a server to get the chunk list, then fetches the full sketch from S3.',
    activeNodes: ['storage', 'instant3', 'readerB'],
    activeEdges: (() => {
      const connectGrow = edgeGrowDurationS({
        from: 'readerB',
        to: 'instant3',
      });
      const fetchGrow =
        connectGrow + edgeGrowDurationS({ from: 'storage', to: 'readerB' });
      return [
        // Reader B connects to instant3 (grow, bidi), then disconnects (shrink)
        {
          from: 'readerB',
          to: 'instant3',
          grow: true,
          stream: false,
          bidi: true,
          shrink: true,
          shrinkDelay: connectGrow,
          shrinkToward: 'from',
        },
        // S3 → Reader B (grow line, then stream + shrink with last particle)
        {
          from: 'storage',
          to: 'readerB',
          grow: true,
          enterDelay: connectGrow,
          streamDelay: fetchGrow,
          shrink: true,
          shrinkDelay: fetchGrow,
          shrinkToward: 'to',
        },
      ];
    })(),
    dimNodes: ['writer', 'instant1', 'instant2', 'readerA', 'readerC'],
  },
];
