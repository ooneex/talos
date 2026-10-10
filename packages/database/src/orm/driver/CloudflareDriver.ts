import type { ReservedSQL } from "bun";
import { DatabaseException } from "../../DatabaseException";
import type {
  CloudflareDataSourceOptionsType,
  CloudflareResultType,
  CloudflareValueType,
  DatabaseClientType,
  DatabaseTypeType,
  ICloudflareDatabase,
  ICloudflarePreparedStatement,
  ObjectLiteralType,
  QueryResultType,
  TransactionIsolationLevelType,
} from "../../types";
import { DriverFeatureNotSupportedError, TransactionsNotSupportedError } from "../errors";
import { AbstractSqliteDriver } from "./SqliteDriver";

const CLOUDFLARE_API_URL = "https://api.cloudflare.com/client/v4";
// The list endpoint's `name` filter is a search, so ask for its largest page to keep the exact match on it.
const CLOUDFLARE_LIST_PAGE_SIZE = 10_000;

type CloudflareApiResponseType<Result> = {
  success?: boolean;
  errors?: { code: number; message: string }[];
  result?: Result;
};

type CloudflareDatabaseInfoType = { uuid: string; name: string };

type CloudflareHttpOptionsType = CloudflareDataSourceOptionsType & { accountId: string; apiToken: string };

const cloudflareValue = (value: unknown): CloudflareValueType => {
  if (value === undefined) {
    return null;
  }

  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof ArrayBuffer
  ) {
    return value;
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice().buffer;
  }

  if (typeof value === "bigint") {
    const number = Number(value);

    if (Number.isSafeInteger(number)) {
      return number;
    }

    throw new DriverFeatureNotSupportedError("cloudflare", "BigInt values outside JavaScript's safe integer range");
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return JSON.stringify(value);
};

/** Encodes a bound value the way the Worker binding sends it to D1: booleans as 1/0, BLOBs as byte arrays. */
const cloudflareHttpValue = (value: CloudflareValueType): unknown => {
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }

  if (value instanceof ArrayBuffer) {
    return Array.from(new Uint8Array(value));
  }

  return value;
};

/** D1 database reached through the Cloudflare REST API, for code running outside a Worker. */
class CloudflareHttpDatabase implements ICloudflareDatabase {
  private lookup: Promise<string> | undefined;

  public constructor(private readonly options: CloudflareHttpOptionsType) {}

  public prepare(sql: string): ICloudflarePreparedStatement {
    return this.statement(sql, []);
  }

  private statement(sql: string, parameters: CloudflareValueType[]): ICloudflarePreparedStatement {
    return {
      bind: (...values) => this.statement(sql, values),
      run: <Row = ObjectLiteralType>() => this.run<Row>(sql, parameters),
    };
  }

  private async run<Row>(sql: string, parameters: CloudflareValueType[]): Promise<CloudflareResultType<Row>> {
    const databaseId = await this.resolveDatabaseId();
    const results = await this.request<CloudflareResultType<Row>[]>(`/${encodeURIComponent(databaseId)}/query`, {
      sql,
      params: parameters.map(cloudflareHttpValue),
    });

    return results[0] ?? { success: true, results: [] };
  }

  /** Concurrent first queries share one lookup; a failed lookup is retried by the next query. */
  private async resolveDatabaseId(): Promise<string> {
    if (this.options.databaseId) {
      return this.options.databaseId;
    }

    this.lookup ??= this.findOrCreateDatabase(this.options.databaseName ?? "").catch((error: unknown) => {
      this.lookup = undefined;
      throw error;
    });

    return this.lookup;
  }

  private async findOrCreateDatabase(name: string): Promise<string> {
    const search = new URLSearchParams({ name, per_page: String(CLOUDFLARE_LIST_PAGE_SIZE) });
    const databases = await this.request<CloudflareDatabaseInfoType[]>(`?${search}`);
    const existing = databases.find((database) => database.name === name);

    if (existing) {
      return existing.uuid;
    }

    const { jurisdiction, primaryLocationHint, readReplicationMode } = this.options;
    const created = await this.request<CloudflareDatabaseInfoType>("", {
      name,
      ...(jurisdiction && { jurisdiction }),
      ...(primaryLocationHint && { primary_location_hint: primaryLocationHint }),
      ...(readReplicationMode && { read_replication: { mode: readReplicationMode } }),
    });

    return created.uuid;
  }

  /** Calls `/accounts/{account_id}/d1/database{path}`, as a POST when a body is given. */
  private async request<Result>(path: string, body?: Record<string, unknown>): Promise<Result> {
    const { accountId, apiToken } = this.options;
    const response = await fetch(`${CLOUDFLARE_API_URL}/accounts/${encodeURIComponent(accountId)}/d1/database${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => null)) as CloudflareApiResponseType<Result> | null;

    if (!response.ok || !payload?.success) {
      const errors = payload?.errors ?? [];
      const detail =
        errors.map(({ code, message }) => `${message} [${code}]`).join("; ") || response.statusText || "unknown error";

      throw new DatabaseException(
        `Cloudflare D1 API request failed (${response.status}): ${detail}`,
        "CLOUDFLARE_REQUEST_FAILED",
        { status: response.status, errors },
      );
    }

    return payload.result as Result;
  }
}

/** Cloudflare D1 driver using the SQLite dialect, through a Worker binding or, without one, the D1 HTTP API. */
export class CloudflareDriver extends AbstractSqliteDriver<ICloudflareDatabase> {
  public override readonly type: DatabaseTypeType = "cloudflare";
  public override readonly supportsReservedConnections = false;
  public override readonly supportsTransactions = false;

  public override createParameter(index: number): string {
    return `?${index + 1}`;
  }

  public override createClient(): ICloudflareDatabase {
    const options = this.options as CloudflareDataSourceOptionsType;

    if (options.client) {
      return options.client;
    }

    const { accountId, apiToken, databaseId, databaseName } = options;

    if (!accountId || !apiToken || !(databaseId || databaseName)) {
      const missing = Object.entries({ accountId, apiToken, "databaseId or databaseName": databaseId || databaseName })
        .filter(([, value]) => !value)
        .map(([setting]) => setting);

      throw new DatabaseException(
        `The cloudflare driver needs a Worker binding as client, or D1 HTTP API settings. Missing: ${missing.join(", ")}.`,
        "CONNECTION_FAILED",
        { missing },
      );
    }

    return new CloudflareHttpDatabase({ ...options, accountId, apiToken });
  }

  public override async connect(client: DatabaseClientType): Promise<void> {
    await this.afterConnect(client);
  }

  public override async disconnect(_client: DatabaseClientType): Promise<void> {}

  public override async afterConnect(client: DatabaseClientType): Promise<void> {
    await (client as ICloudflareDatabase).prepare("SELECT 1").run();
  }

  public override async query<Row = ObjectLiteralType>(
    client: DatabaseClientType | ReservedSQL,
    sql: string,
    parameters: unknown[] = [],
  ): Promise<QueryResultType<Row>> {
    const prepared = (client as ICloudflareDatabase).prepare(sql);
    const statement = parameters.length > 0 ? prepared.bind(...parameters.map(cloudflareValue)) : prepared;
    const result = await statement.run<Row>();
    const records = result.results ?? [];

    return {
      records,
      affected: result.meta?.changes ?? records.length,
      lastInsertRowid: result.meta?.last_row_id ?? null,
    };
  }

  public override beginTransactionStatements(_isolationLevel?: TransactionIsolationLevelType): string[] {
    throw new TransactionsNotSupportedError(this.type);
  }
}
