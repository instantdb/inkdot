/**
 * Compare two UUIDs by byte value, matching how InstantDB orders by id.
 * Mirrors @instantdb/core's internal uuidCompare.
 */
export function uuidCompare(a: string, b: string): number {
  const hexA = a.replace(/-/g, '');
  const hexB = b.replace(/-/g, '');
  for (let i = 0; i < hexA.length; i += 2) {
    const byteA = parseInt(hexA.substring(i, i + 2), 16);
    const byteB = parseInt(hexB.substring(i, i + 2), 16);
    if (byteA < byteB) return -1;
    if (byteA > byteB) return 1;
  }
  return 0;
}
