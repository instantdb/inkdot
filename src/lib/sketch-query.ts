type VoteQueryUser = {
  id?: string | null;
  type?: string | null;
};

export function viewerVotesQuery(user?: VoteQueryUser | string | null) {
  const userId =
    typeof user === 'string'
      ? user
      : user?.type === 'guest'
        ? undefined
        : user?.id;

  if (!userId) {
    return {};
  }

  return {
    votes: {
      $: {
        where: { user: userId },
      },
    },
  } as const;
}

export function sketchQuery(
  sketchId: string,
  user?: VoteQueryUser | string | null,
) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      ...viewerVotesQuery(user),
      $: { where: { id: sketchId } },
    },
  } as const;
}
