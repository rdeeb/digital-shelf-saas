import type { NormalizedAppMetadata, SteamAppDetailsEntry } from './types.js';

export function normalizeAppDetails(
  externalId: string,
  entry: SteamAppDetailsEntry,
): NormalizedAppMetadata {
  const data = entry.data ?? {
    name: '',
    developers: [],
    publishers: [],
  };

  return {
    externalId,
    name: data.name ?? '',
    developers: data.developers ?? [],
    publishers: data.publishers ?? [],
    headerImageUrl: data.header_image ?? null,
    capsuleImageUrl: data.capsule_image ?? null,
    metadataJson: data,
  };
}
