// biome-ignore lint/suspicious/noExplicitAny: trust me
export type FeatureFlagClassType = new (...args: any[]) => IFeatureFlag;

export interface IFeatureFlag {
  getKey: () => string;
  getDescription: () => string;
  isEnabled: () => Promise<boolean> | boolean;
}
