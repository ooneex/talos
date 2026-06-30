import { getId } from "./getId";

export const getWatchUrl = (urlOrId: string): string | null => {
  const videoId = getId(urlOrId) ?? urlOrId;

  if (!/^[\w-]{10,12}$/.test(videoId)) {
    return null;
  }

  return `https://www.youtube.com/watch?v=${videoId}`;
};
