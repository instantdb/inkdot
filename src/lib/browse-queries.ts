import { viewerVotesQuery } from '@/lib/sketch-query';

export const DEFAULT_PAGE_SIZE = 51;

export type GalleryCursor = [string, string, unknown, number];

export function newestPageQuery(
  userId?: string,
  cursors?: {
    first?: number;
    after?: GalleryCursor;
    last?: number;
    before?: GalleryCursor;
  },
) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(userId),
      $: {
        order: { createdAt: 'desc' as const },
        ...(cursors ?? {}),
      },
    },
  };
}

export function topPageQuery(userId?: string) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(userId),
      $: {},
    },
  };
}

export function bestPageQuery(userId?: string) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(userId),
      $: {
        where: { or: [{ flagged: false }, { flagged: { $isNull: true } }] },
        order: { score: 'desc' as const },
        first: 1,
      },
    },
  };
}
