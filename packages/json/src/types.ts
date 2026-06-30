export type JsonIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };

export type JsonLoadOptionsType<T = unknown> = {
  ignore?: JsonIgnoreType<T>;
};

export type JsonToYamlOptionsType<T = unknown> = {
  path: string;
  ignore?: JsonIgnoreType<T>;
};

export type JsonCsvSeparatorType = "," | ";" | ":" | "|" | "\t";

export type JsonToCsvOptionsType<T = unknown> = {
  path: string;
  headers: Array<keyof T & string>;
  separator: JsonCsvSeparatorType;
  ignore?: JsonIgnoreType<T>;
};

export interface IJson<T = unknown> {
  getPath: () => string;
  load: (options?: JsonLoadOptionsType<T>) => AsyncGenerator<T>;
  toYaml: (options: JsonToYamlOptionsType<T>) => Promise<void>;
  toCsv: (options: JsonToCsvOptionsType<T>) => Promise<void>;
}
