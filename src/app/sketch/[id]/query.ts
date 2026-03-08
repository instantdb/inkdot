export function sketchQuery(sketchId: string) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      votes: {},
      $: { where: { id: sketchId } },
    },
  } as const;
}
