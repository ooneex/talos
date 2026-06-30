import type { JWTHeaderParameters } from "jose";

// biome-ignore lint/suspicious/noExplicitAny: trust me
export type JwtClassType = new (...args: any[]) => IJwt;

export type JwtExpiresInType = `${number}s` | `${number}m` | `${number}h` | `${number}d` | `${number}w` | `${number}y`;

export type JwtDefaultPayloadType = {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  jti?: string;
  nbf?: number | string | Date;
  exp?: number | JwtExpiresInType | Date;
  iat?: number | string | Date;
};

export type JwtPayloadType<T> = JwtDefaultPayloadType & T;

export interface IJwt {
  create: <T extends Record<string, unknown> = Record<string, unknown>>(config?: {
    payload?: JwtDefaultPayloadType & JwtPayloadType<T>;
    header?: JWTHeaderParameters;
  }) => Promise<string>;
  getPayload: <T extends Record<string, unknown> = Record<string, unknown>>(token: string) => JwtPayloadType<T>;
  getHeader: (token: string) => JWTHeaderParameters;
  isValid: (token: string) => Promise<boolean> | boolean;
  getSecret: () => string;
}
