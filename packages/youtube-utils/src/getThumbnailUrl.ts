import { getId } from "./getId";

export const getThumbnailUrl = (urlOrId: string): string | null => {
  const youtubeId = getId(urlOrId) ?? urlOrId;

  if (!/^[\w-]{10,12}$/.test(youtubeId)) {
    return null;
  }

  return `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg`;
};
