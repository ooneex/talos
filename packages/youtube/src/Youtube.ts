import type { IYoutube, YoutubeTranscriptResponseType } from "./types";
import { YoutubeException } from "./YoutubeException";

export class Youtube implements IYoutube {
  private static readonly BASE_URL = "https://transcriptapi.com/api/v2";

  private readonly apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey ?? Bun.env.YOUTUBE_TRANSCRIPT_API_KEY ?? "";

    if (!this.apiKey) {
      throw new YoutubeException(
        "YouTube Transcript API key is required. Please set the YOUTUBE_TRANSCRIPT_API_KEY environment variable.",
        "API_KEY_REQUIRED",
      );
    }
  }

  public async transcript(videoId: string): Promise<YoutubeTranscriptResponseType> {
    const params = new URLSearchParams({
      video_url: videoId,
      format: "json",
      include_timestamp: "true",
      send_metadata: "true",
    });

    const response = await fetch(`${Youtube.BASE_URL}/youtube/transcript?${params}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new YoutubeException(
        `Transcript API error: ${response.status} ${response.statusText}`,
        "TRANSCRIPT_FAILED",
        { videoId, status: response.status },
      );
    }

    const data = await response.json();

    return {
      id: data.video_id,
      lang: data.language,
      transcript: data.transcript,
      metadata: {
        title: data.metadata.title,
        author: {
          name: data.metadata.author_name,
          url: data.metadata.author_url,
        },
        thumbnail: data.metadata.thumbnail_url,
      },
    };
  }
}
