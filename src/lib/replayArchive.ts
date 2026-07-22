export async function createReplayArchive(files: File[], rangeStart: string) {
  const { zipSync } = await import("fflate");
  const entries: Record<string, Uint8Array> = {};
  for (const file of files) {
    entries[file.name] = new Uint8Array(await file.arrayBuffer());
  }
  const zipped = zipSync(entries, { level: 0 });
  const bytes = new Uint8Array(zipped.byteLength);
  bytes.set(zipped);
  const safeRange = rangeStart.replaceAll("-", "");
  return new File([bytes], `pinly-replay-${safeRange}.zip`, {
    type: "application/zip",
  });
}
