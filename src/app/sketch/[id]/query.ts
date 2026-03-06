export function sketchQuery(sketchId: string) {
  return {
    sketches: {
      stream: {},
      thumbnail: {},
      author: {},
      remixOf: { author: {} },
      $: { where: { id: sketchId } },
    },
  } as const;
}
