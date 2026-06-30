export type YamlIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };

export type YamlLoadOptionsType<T = unknown> = {
  ignore?: YamlIgnoreType<T>;
};

export type YamlToJsonOptionsType<T = unknown> = {
  path: string;
  ignore?: YamlIgnoreType<T>;
};

export type YamlCsvSeparatorType = "," | ";" | ":" | "|" | "\t";

export type YamlToCsvOptionsType<T = unknown> = {
  path: string;
  headers: Array<keyof T & string>;
  separator: YamlCsvSeparatorType;
  ignore?: YamlIgnoreType<T>;
};

export interface IYaml<T = unknown> {
  getPath: () => string;
  load: (options?: YamlLoadOptionsType<T>) => AsyncGenerator<T>;
  toJson: (options: YamlToJsonOptionsType<T>) => Promise<void>;
  toCsv: (options: YamlToCsvOptionsType<T>) => Promise<void>;
}
