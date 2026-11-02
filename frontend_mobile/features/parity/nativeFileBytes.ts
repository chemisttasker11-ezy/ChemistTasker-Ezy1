/** React Native's fetch Response reads Blobs through its supported FileReader bridge. */
export async function nativeFileBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await new Response(blob).arrayBuffer());
}
