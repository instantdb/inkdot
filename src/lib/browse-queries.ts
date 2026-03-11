import { viewerVotesQuery } from '@/lib/sketch-query';

export const DEFAULT_PAGE_SIZE = 51;

export type GalleryCursor = [string, string, unknown, number];

export function newestPageQuery(
  user?: { id?: string | null; type?: string | null } | string | null,
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
      ...viewerVotesQuery(user),
      $: {
        order: { createdAt: 'desc' as const },
        first: DEFAULT_PAGE_SIZE,
        ...(cursors ?? {}),
      },
    },
  };
}

export function topPageQuery(
  user?: { id?: string | null; type?: string | null } | string | null,
) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(user),
      $: {
        order: { score: 'desc' as const },
        first: DEFAULT_PAGE_SIZE,
      },
    },
  };
}

export function bestPageQuery(
  user?: { id?: string | null; type?: string | null } | string | null,
) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(user),
      $: {
        where: { flagged: { $ne: true } },
        order: { score: 'desc' as const },
        first: 1,
      },
    },
  };
}
