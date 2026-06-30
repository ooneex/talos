import type { ArgsOptions, FormatOptions, QualityOptions, VideoFormat, VideoProgress } from "ytdlp-nodejs";

export type YoutubeVideoFormatType = VideoFormat;

export type YoutubeVideoProgressType = VideoProgress;

export type YoutubeArgsOptionsType = ArgsOptions;

export type YoutubeFormatOptionsType<F extends YoutubeFormatKeyWordType> = FormatOptions<F>;

export type YoutubeQualityOptionsType = QualityOptions;

export type YoutubeFormatKeyWordType = keyof QualityOptions;

export type YoutubeVideoQualityType =
  | "2160p"
  | "1440p"
  | "1080p"
  | "720p"
  | "480p"
  | "360p"
  | "240p"
  | "144p"
  | "highest"
  | "lowest";

export type YoutubeAudioQualityType = "highest" | "lowest";

export type YoutubeTranscriptSegmentType = {
  text: string;
  start: number;
  duration: number;
};

export type YoutubeTranscriptAuthorType = {
  name: string;
  url: string;
};

export type YoutubeTranscriptMetadataType = {
  title: string;
  author: YoutubeTranscriptAuthorType;
  thumbnail: string;
};

export type YoutubeTranscriptResponseType = {
  id: string;
  lang: string;
  transcript: YoutubeTranscriptSegmentType[];
  metadata: YoutubeTranscriptMetadataType;
};

export interface IYoutube {
  transcript(videoId: string): Promise<YoutubeTranscriptResponseType>;
}
