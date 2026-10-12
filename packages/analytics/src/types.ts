// biome-ignore lint/suspicious/noExplicitAny: trust me
export type AnalyticsClassType = new (...args: any[]) => IAnalytics;

// biome-ignore lint/suspicious/noExplicitAny: trust me
export interface IAnalytics<T = any> {
  capture: (options: T) => void;
  shutdown?: () => Promise<void>;
}

export type PostHogConfigType = {
  apiKey?: string;
  host?: string;
};

export type PostHogCaptureOptionsType = {
  id: string;
  event: string;
  /** Properties of the event itself, filed on the event in PostHog. */
  properties?: Record<string, unknown>;
  /** Person properties to set on the profile (`$set`). */
  set?: Record<string, unknown>;
  /** Person properties to set only once on the profile (`$set_once`). */
  setOnce?: Record<string, unknown>;
  groups?: Record<string, string | number>;
  /** When the event happened; defaults to now. */
  timestamp?: Date;
  /** A stable id so PostHog drops a duplicate delivery of the same event. */
  uuid?: string;
};
