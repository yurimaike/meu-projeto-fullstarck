import { createClient, type Client, type ResultSet } from "@libsql/client/web";
import { and, eq } from "drizzle-orm";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "../db/schema";
import {
  account,
  session,
  storageFiles,
  user as userTable,
  type NewStorageFile,
  type StorageFile
} from "../db/schema";
import { env } from "./env";

export type DatabaseErrorCode =
  | "DATABASE_UNCONFIGURED"
  | "DATABASE_QUERY_FAILED"
  | "INVALID_INPUT"
  | "SLOT_UNAVAILABLE"
  | "BOOKING_NOT_PENDING";

export class DatabaseError extends Error {
  constructor(
    readonly code: DatabaseErrorCode,
    message: string,
    readonly status = 500,
    readonly databaseMessage = ""
  ) {
    super(message);
    this.name = "DatabaseError";
  }
}

export type SqlArgs = Array<string | number | bigint | boolean | null>;
export type QueryResult = ResultSet;

let client: Client | null = null;
let db: LibSQLDatabase<typeof schema> | null = null;
type FetchInput = Parameters<typeof fetch>[0];

export function isDatabaseConfigured() {
  const tursoConfigured = Boolean(env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN);
  const legacySkybaseConfigured = Boolean(
    env.SKYBASE_DB_ENDPOINT && env.SKYBASE_DB_TOKEN && env.SKYBASE_DB_NAMESPACE
  );
  return tursoConfigured || legacySkybaseConfigured;
}

function assertConfigured() {
  if (!isDatabaseConfigured()) {
    throw new DatabaseError("DATABASE_UNCONFIGURED", "Database connection is not configured. Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN.", 503);
  }
}

function getClient() {
  assertConfigured();

  if (!client) {
    // Prefer Turso whenever its two required variables are present. The
    // namespace fetch wrapper is only used by the temporary legacy fallback.
    if (env.TURSO_DATABASE_URL && env.TURSO_AUTH_TOKEN) {
      client = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_AUTH_TOKEN
      });
    } else {
      client = createClient({
        url: env.SKYBASE_DB_ENDPOINT,
        authToken: env.SKYBASE_DB_TOKEN,
        fetch: createNamespaceFetch(env.SKYBASE_DB_NAMESPACE)
      });
    }
  }

  return client;
}

export function getDb() {
  assertConfigured();

  if (!db) {
    db = drizzle(getClient(), { schema });
  }

  return db;
}

function mapLibsqlError(error: unknown, sql: string): DatabaseError {
  if (error instanceof DatabaseError) {
    return error;
  }

  const databaseMessage = error instanceof Error ? error.message : "";
  const isBookingSlotConflict =
    /insert\s+into\s+bookings/i.test(sql) &&
    /(uq_bookings_active_slot|bookings\.bookingDate|unique constraint failed)/i.test(databaseMessage);

  if (isBookingSlotConflict) {
    return new DatabaseError(
      "SLOT_UNAVAILABLE",
      "Este horário acabou de ser reservado. Escolha outro.",
      409,
      databaseMessage,
    );
  }

  return new DatabaseError("DATABASE_QUERY_FAILED", "Database query failed", 502, databaseMessage);
}

export async function checkDatabaseHealth() {
  await executeSql("select 1 as ok");
  return { ok: true };
}

export async function executeSql(sql: string, args?: SqlArgs): Promise<QueryResult> {
  try {
    return await getClient().execute({ sql, args });
  } catch (error) {
    throw mapLibsqlError(error, sql);
  }
}

export type StorageFileRecord = StorageFile;
export type NewStorageFileRecord = NewStorageFile;

export async function insertStorageFile(values: NewStorageFileRecord): Promise<StorageFileRecord> {
  const rows = await getDb().insert(storageFiles).values(values).returning();
  return rows[0];
}

export async function updateStorageFile(
  id: string,
  values: Partial<NewStorageFileRecord>
): Promise<StorageFileRecord> {
  const rows = await getDb().update(storageFiles).set(values).where(eq(storageFiles.id, id)).returning();
  return rows[0];
}

export async function findStorageFileById(id: string): Promise<StorageFileRecord | undefined> {
  const rows = await getDb().select().from(storageFiles).where(eq(storageFiles.id, id)).limit(1);
  return rows[0];
}

export async function findStorageFileByIdForUser(
  id: string,
  userId: string
): Promise<StorageFileRecord | undefined> {
  const rows = await getDb()
    .select()
    .from(storageFiles)
    .where(and(eq(storageFiles.id, id), eq(storageFiles.userId, userId)))
    .limit(1);
  return rows[0];
}

export async function findStorageFileByPath(path: string): Promise<StorageFileRecord | undefined> {
  const rows = await getDb().select().from(storageFiles).where(eq(storageFiles.path, path)).limit(1);
  return rows[0];
}

export type UserRecord = typeof userTable.$inferSelect;
export type AuthSessionRecord = typeof session.$inferSelect;

export type ThirdPartyUserInput = {
  providerId: string;
  providerAccountId: string;
  email: string;
  emailVerified: boolean;
  name: string;
  image: string | null;
};

export async function upsertThirdPartyUser(input: ThirdPartyUserInput): Promise<UserRecord> {
  const db = getDb();
  const now = new Date();
  const existing = await db.query.user.findFirst({
    where: eq(userTable.email, input.email)
  });

  if (existing) {
    const rows = await db
      .update(userTable)
      .set({
        name: input.name,
        emailVerified: existing.emailVerified || input.emailVerified,
        image: input.image ?? existing.image,
        updatedAt: now
      })
      .where(eq(userTable.id, existing.id))
      .returning();
    const user = rows[0] ?? existing;
    await ensureThirdPartyAccount(user.id, input.providerId, input.providerAccountId, now);
    return user;
  }

  const rows = await db
    .insert(userTable)
    .values({
      id: crypto.randomUUID(),
      email: input.email,
      name: input.name,
      emailVerified: input.emailVerified,
      image: input.image,
      role: "user",
      createdAt: now,
      updatedAt: now
    })
    .returning();

  const created = rows[0];
  await ensureThirdPartyAccount(created.id, input.providerId, input.providerAccountId, now);
  return created;
}

export async function createAuthSessionRecord(
  userId: string,
  token: string,
  expiresAt: Date
): Promise<AuthSessionRecord> {
  const now = new Date();
  const rows = await getDb()
    .insert(session)
    .values({
      id: crypto.randomUUID(),
      token,
      userId,
      expiresAt,
      createdAt: now,
      updatedAt: now
    })
    .returning();

  return rows[0];
}

async function ensureThirdPartyAccount(
  userId: string,
  providerId: string,
  providerAccountId: string,
  now: Date
) {
  const db = getDb();
  const existing = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, providerId))
  });

  if (existing && existing.accountId !== providerAccountId) {
    throw new DatabaseError("INVALID_INPUT", "Google account identity mismatch", 409);
  }

  const linked = await db.query.account.findFirst({
    where: and(eq(account.providerId, providerId), eq(account.accountId, providerAccountId))
  });
  if (linked && linked.userId !== userId) {
    throw new DatabaseError("INVALID_INPUT", "Google account is linked to another user", 409);
  }

  if (existing) return;

  await db.insert(account).values({
    id: crypto.randomUUID(),
    accountId: providerAccountId,
    providerId,
    userId,
    createdAt: now,
    updatedAt: now
  });
}

function createNamespaceFetch(namespace: string) {
  return (input: FetchInput, init?: RequestInit) => {
    if (!namespace) {
      return fetch(input, init);
    }

    if (input instanceof Request) {
      const headers = new Headers(input.headers);
      headers.set("x-namespace", namespace);
      return fetch(new Request(input, { headers }));
    }

    const headers = new Headers(init?.headers);
    headers.set("x-namespace", namespace);
    return fetch(input, { ...init, headers });
  };
}
