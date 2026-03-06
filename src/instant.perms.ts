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
    },
    allow: {
      view: 'true',
      create: 'auth.id != null',
      update: 'isAuthor || isAdmin',
      delete: 'isAuthor || isAdmin',
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
