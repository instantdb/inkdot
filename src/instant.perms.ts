// Docs: https://www.instantdb.com/docs/permissions

import type { InstantRules } from '@instantdb/react';

const rules = {
  $default: {
    allow: {
      $default: 'false',
    },
  },
  $streams: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'false',
      delete: 'false',
    },
  },
  $files: {
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'false',
      delete: 'false',
    },
  },
  $users: {
    bind: {
      isSameUser: 'auth.id == data.id',
      notChangingHandle: 'data.handle == newData.handle || data.handle == null',
      hasEmail: 'data.email != null',
    },
    allow: {
      view: 'true',
      update: 'isSameUser && notChangingHandle && hasEmail',
    },
    fields: {
      email: 'isSameUser',
      type: 'isSameUser',
    },
  },
  sketches: {
    bind: {
      isAuthor: "auth.id in data.ref('author.id')",
      isAdmin: "auth.email.endsWith('@instantdb.com')",
      deleteWindowOpen:
        '(request.time - timestamp(data.createdAt)).getMinutes() < 6',
      noProtectedFieldsOnCreate:
        "!('flagged' in request.modifiedFields) && !('score' in request.modifiedFields)",
      noProtectedFieldsOnUpdate:
        "!('createdAt' in request.modifiedFields) && !('flagged' in request.modifiedFields) && !('score' in request.modifiedFields)",
    },
    allow: {
      view: 'true',
      create: 'isAdmin || (auth.id != null && noProtectedFieldsOnCreate)',
      update: 'isAdmin || (isAuthor && noProtectedFieldsOnUpdate)',
      delete: '(isAuthor && deleteWindowOpen) || isAdmin',
    },
  },
  reports: {
    bind: {
      isAdmin: "auth.email.endsWith('@instantdb.com')",
    },
    allow: {
      view: 'isAdmin',
      create: 'isAdmin',
      update: 'isAdmin',
      delete: 'isAdmin',
    },
  },
  votes: {
    allow: {
      view: 'auth.id == data.user',
      create: 'false',
      update: 'false',
      delete: 'false',
    },
  },
  views: {
    bind: {
      hasSketch: 'data.sketch != null',
      isSignedOutAnonymousView: 'auth.id == null && data.user == null',
      isSignedInOwnView: 'auth.id != null && data.user == auth.id',
    },
    allow: {
      view: 'false',
      create: 'hasSketch && (isSignedOutAnonymousView || isSignedInOwnView)',
      update: 'false',
      delete: 'false',
    },
  },
  userSettings: {
    bind: {
      isOwner: 'data.owner == auth.id',
    },
    allow: {
      view: 'isOwner',
      create: 'isOwner',
      update: 'isOwner',
      delete: 'false',
    },
  },
} satisfies InstantRules;

export default rules;
