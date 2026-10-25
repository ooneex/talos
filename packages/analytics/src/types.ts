export type AnalyticsClassType = new (...args: any[]) => IAnalytics;

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
  properties?: Record<string, unknown>;
  groups?: Record<string, string | number>;
};
