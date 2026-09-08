import type {
  ColumnModeType,
  ColumnOptionsType,
  DatabaseTypeType,
  INamingStrategy,
  PrimaryGeneratedColumnType,
} from "../../src";
import { DataSource } from "../../src/orm/DataSource";
import { ColumnMetadata, EntityMetadata } from "../../src/orm/EntityMetadata";
import { EntityMetadataBuilder } from "../../src/orm/EntityMetadataBuilder";
import { getMetadataArgsStorage } from "../../src/orm/MetadataArgsStorage";
import { DefaultNamingStrategy } from "../../src/orm/NamingStrategy";
import { fixtureEntities } from "./entities";

/**
 * A data source of the given dialect that is never connected: its metadata is built by hand so that
 * query builders can render SQL for PostgreSQL or MySQL without a server.
 */
export const createDialectDataSource = (type: Exclude<DatabaseTypeType, "cloudflare">): DataSource => {
  const dataSource =
    type === "sqlite"
      ? new DataSource({ type, database: ":memory:", entities: fixtureEntities })
      : type === "turso"
        ? new DataSource({ type, url: ":memory:", entities: fixtureEntities })
        : new DataSource({ type, entities: fixtureEntities });

  dataSource.entityMetadatas = buildFixtureMetadatas();

  return dataSource;
};

/** The fixture entities' metadata, built the way a DataSource builds it. */
export const buildFixtureMetadatas = (
  namingStrategy: INamingStrategy = new DefaultNamingStrategy(),
  entityPrefix = "",
): EntityMetadata[] =>
  new EntityMetadataBuilder(getMetadataArgsStorage(), namingStrategy, entityPrefix).build(fixtureEntities);

export const findMetadata = (metadatas: EntityMetadata[], name: string): EntityMetadata => {
  const metadata = metadatas.find((candidate) => candidate.name === name);

  if (!metadata) {
    throw new Error(`No fixture metadata named ${name}`);
  }

  return metadata;
};

class StubEntity {}

/** A stand-alone column, for driver and hydration tests that need no entity. */
export const fakeColumn = (
  options: ColumnOptionsType,
  mode: ColumnModeType = "regular",
  generationStrategy?: PrimaryGeneratedColumnType,
): ColumnMetadata =>
  new ColumnMetadata({
    entityMetadata: new EntityMetadata({ args: { target: StubEntity }, tableName: "stub" }),
    args: { target: StubEntity, propertyName: "value", mode, options },
    databaseName: options.name ?? "value",
    generationStrategy,
  });
