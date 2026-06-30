export type CsvIgnoreType<T = unknown> = { [K in keyof T]?: RegExp };

export type CsvSeparatorType = "," | ";" | ":" | "|" | "\t";

export type CsvLoadOptionsType<T = unknown> = {
  ignore?: CsvIgnoreType<T>;
};

export type CsvToJsonOptionsType<T = unknown> = {
  path: string;
  ignore?: CsvIgnoreType<T>;
};

export type CsvToYamlOptionsType<T = unknown> = {
  path: string;
  ignore?: CsvIgnoreType<T>;
};

export interface ICsv<T = unknown> {
  getPath: () => string;
  load: (options?: CsvLoadOptionsType<T>) => AsyncGenerator<T>;
  toJson: (options: CsvToJsonOptionsType<T>) => Promise<void>;
  toYaml: (options: CsvToYamlOptionsType<T>) => Promise<void>;
}
