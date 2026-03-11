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
      $: {},
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
        where: { or: [{ flagged: false }, { flagged: { $isNull: true } }] },
        order: { score: 'desc' as const },
        first: 1,
      },
    },
  };
}
