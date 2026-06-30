import { parseString } from "./parseString";
import { toCamelCase } from "./toCamelCase";

export const parseEnvVars = <T = Record<string, string>>(envs: Record<string, string>): T => {
  const vars: Record<string, string> = {};

  for (const key in envs) {
    const k = toCamelCase(key);
    const value = parseString(envs[key] as string) as string;
    vars[k] = value;
  }

  return vars as T;
};
