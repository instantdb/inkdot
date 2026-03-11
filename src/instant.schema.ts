// Docs: https://www.instantdb.com/docs/modeling-data

import { i } from '@instantdb/react';

const _schema = i.schema({
  entities: {
    $files: i.entity({
      path: i.string().unique().indexed(),
      url: i.string(),
    }),
    $streams: i.entity({
      abortReason: i.string().optional(),
      clientId: i.string().unique().indexed(),
      done: i.boolean().optional(),
      size: i.number().optional(),
    }),
    $users: i.entity({
      email: i.string().unique().indexed().optional(),
      handle: i.string().unique().indexed().optional(),
      imageURL: i.string().optional(),
      type: i.string().optional(),
    }),
    sketches: i.entity({
      createdAt: i.number().indexed(),
      duration: i.number().optional(),
      durationMs: i.number().optional(),
      trimStart: i.number().optional(),
      trimEnd: i.number().optional(),
      flagged: i.boolean().optional(),
      score: i.number().indexed().optional(),
      inkBudget: i.number().optional(),
    }),
    votes: i.entity({
      createdAt: i.number().indexed(),
    }),
    reports: i.entity({
      createdAt: i.number().indexed(),
      sketchId: i.string(),
      reporterEmail: i.string().optional(),
      reporterIp: i.string().optional(),
      reporterLocation: i.string().optional(),
      reporterUserAgent: i.string().optional(),
      reason: i.string(),
      details: i.string().optional(),
      status: i.string().optional(),
    }),
    userSettings: i.entity({
      penColors: i.json<string[]>().optional(),
      bgColors: i.json<string[]>().optional(),
      playbackSpeed: i.number().optional(),
      lastTool: i.string().optional(),
      lastPenColor: i.string().optional(),
      lastBgColor: i.string().optional(),
      lastBrushSize: i.number().optional(),
      showCursor: i.boolean().optional(),
      darkMode: i.string().optional(),
    }),
  },
  links: {
    $streams$files: {
      forward: {
        on: '$streams',
        has: 'many',
        label: '$files',
      },
      reverse: {
        on: '$files',
        has: 'one',
        label: '$stream',
        onDelete: 'cascade',
      },
    },
    sketchStream: {
      forward: {
        on: 'sketches',
        has: 'one',
        label: 'stream',
      },
      reverse: {
        on: '$streams',
        has: 'one',
        label: 'sketch',
      },
    },
    sketchThumbnail: {
      forward: {
        on: 'sketches',
        has: 'one',
        label: 'thumbnail',
      },
      reverse: {
        on: '$files',
        has: 'one',
        label: 'sketch',
      },
    },
    sketchAuthor: {
      forward: {
        on: 'sketches',
        has: 'one',
        label: 'author',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'sketches',
      },
    },
    $usersLinkedPrimaryUser: {
      forward: {
        on: '$users',
        has: 'one',
        label: 'linkedPrimaryUser',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'linkedGuestUsers',
      },
    },
    userSettingsOwner: {
      forward: {
        on: 'userSettings',
        has: 'one',
        label: 'owner',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'one',
        label: 'settings',
      },
    },
    reportFrame: {
      forward: {
        on: 'reports',
        has: 'one',
        label: 'frame',
      },
      reverse: {
        on: '$files',
        has: 'one',
        label: 'report',
      },
    },
    sketchRemix: {
      forward: {
        on: 'sketches',
        has: 'one',
        label: 'remixOf',
      },
      reverse: {
        on: 'sketches',
        has: 'many',
        label: 'remixes',
      },
    },
    voteSketch: {
      forward: {
        on: 'votes',
        has: 'one',
        label: 'sketch',
        onDelete: 'cascade',
      },
      reverse: {
        on: 'sketches',
        has: 'many',
        label: 'votes',
      },
    },
    voteUser: {
      forward: {
        on: 'votes',
        has: 'one',
        label: 'user',
        onDelete: 'cascade',
      },
      reverse: {
        on: '$users',
        has: 'many',
        label: 'votes',
      },
    },
  },
  rooms: {},
});

// This helps TypeScript display nicer intellisense
type _AppSchema = typeof _schema;
interface AppSchema extends _AppSchema {}
const schema: AppSchema = _schema;

export type { AppSchema };
export default schema;
