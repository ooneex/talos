import type { IDirectory, IFile } from "./types";

/**
 * `Directory` and `File` each construct instances of the other (`File.getDirectory()`
 * returns a `Directory`, `Directory.getFiles()` yields `File` instances). Importing the
 * classes directly from one another would form an import cycle, so each class registers
 * a factory here at module load time and the other class calls through it instead.
 */
type DirectoryFactoryType = (path: string) => IDirectory;
type FileFactoryType = (path: string) => IFile;

let directoryFactory: DirectoryFactoryType | undefined;
let fileFactory: FileFactoryType | undefined;

/** Registers the factory used to build `IDirectory` instances. Called once by `Directory`. */
export const setDirectoryFactory = (factory: DirectoryFactoryType): void => {
  directoryFactory = factory;
};

/** Registers the factory used to build `IFile` instances. Called once by `File`. */
export const setFileFactory = (factory: FileFactoryType): void => {
  fileFactory = factory;
};

/**
 * Clears both registered factories. Not used by `Directory`/`File` themselves — exists so
 * tests can exercise the "not registered" guard deterministically, since module state is
 * otherwise shared across the whole test run.
 */
export const resetFactoriesForTesting = (): void => {
  directoryFactory = undefined;
  fileFactory = undefined;
};

/** Builds an `IDirectory` instance via the registered `Directory` factory. */
export const createDirectory = (path: string): IDirectory => {
  if (!directoryFactory) {
    throw new Error("Directory factory is not registered — import '@talosjs/fs' before use");
  }
  return directoryFactory(path);
};

/** Builds an `IFile` instance via the registered `File` factory. */
export const createFile = (path: string): IFile => {
  if (!fileFactory) {
    throw new Error("File factory is not registered — import '@talosjs/fs' before use");
  }
  return fileFactory(path);
};
