import { TableData } from "duckdb";
import { DatabaseManager } from "./duckdb-manager";

const DUCKDB_FILE = "test.db";

const TIMEOUT = 20 * 1000;

let db: DatabaseManager;

beforeEach(async () => {
  db = new DatabaseManager(DUCKDB_FILE);
  await db.delete();
  await db.init();
});

it("database connection works", async () => {
  const db = await new DatabaseManager(DUCKDB_FILE).init();
  const result = await db.all("SELECT 1");
  expect(result).toEqual([{ 1: 1 }]);
});

it("database query works", async () => {
  const result = await db.all("SELECT 1");
  expect(result).toEqual([{ 1: 1 }]);
});

it(
  "single worker can insert data",
  async () => {
    await db.all("create table foo (id int);");

    await insertWorker(db, 1000);

    const result = await db.all("select count(*) from foo");
    expect(resultCount(result)).toEqual(1000);
  },
  TIMEOUT
);

it(
  "multiple workers can insert data",
  async () => {
    await db.all("create table foo (id int);");
    const ws = repeat(() => insertWorker(db), 10);

    await Promise.all(ws);

    const result = await db.all("select count(*) from foo");
    expect(resultCount(result)).toEqual(1000);
  },
  TIMEOUT
);

it(
  "single worker can insert data with transactions",
  async () => {
    await db.all("create table foo (id int);");

    await insertWorkerTransaction(db, 1000);

    const result = await db.all("select count(*) from foo");
    expect(resultCount(result)).toEqual(1000);
  },
  TIMEOUT
);

it("multiple workers with transactions throw nested transaction error", async () => {
  await db.all("create table foo (id int);");
  const ws = repeat(() => insertWorkerTransaction(db), 3);

  await expect(Promise.all(ws)).rejects.toThrow(
    "TransactionContext Error: cannot start a transaction within a transaction"
  );
});

it("multiple workers with connections", async () => {
  await db.all("create table foo (id int);");
  const ws = repeat(() => insertWorkerConnection(db), 10);

  await Promise.all(ws);

  const result = await db.all("select count(*) from foo");
  expect(resultCount(result)).toEqual(1000);
});

function insertWorker(db: DatabaseManager, n: number = 100) {
  return new Promise<void>(async (res) => {
    for (let i = 0; i < n; i++) {
      await db.all(`insert into foo (id) VALUES (${i})`);
    }
    res();
  });
}

function insertWorkerTransaction(db: DatabaseManager, n: number = 100) {
  return new Promise<void>(async (res, rej) => {
    try {
      await db.all("begin");
      for (let i = 0; i < n; i++) {
        await db.all(`insert into foo (id) VALUES (${i})`);
      }
      await db.all("commit");
      res();
    } catch (e) {
      rej(e);
    }
  });
}

function insertWorkerConnection(db: DatabaseManager, n: number = 100) {
  return new Promise<void>(async (res, rej) => {
    try {
      await db.transaction(async (conn) => {
        for (let i = 0; i < n; i++) {
          await conn.all(`insert into foo (id) VALUES (${i})`);
        }
      });
      res();
    } catch (e) {
      rej(e);
    }
  });
}

function repeat<T>(fn: () => T, times: number) {
  const xs = [];
  for (let i = 0; i < times; i++) {
    xs.push(fn());
  }
  return xs;
}

function resultCount(result: TableData) {
  return Number(result[0]["count_star()"]);
}
