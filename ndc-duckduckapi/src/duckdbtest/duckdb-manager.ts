import { Connection, Database as DuckDBDatabase } from "duckdb-async";
import fs from "fs-extra";

export class DatabaseManager {
  private url: string;
  db!: DuckDBDatabase;

  constructor(url: string) {
    this.url = url;
  }

  async init() {
    this.db = await DuckDBDatabase.create(this.url);
    return this.db;
  }

  async delete() {
    await fs.remove(this.url);
  }

  async all(sql: string, ...args: any[]) {
    return this.db.all(sql, ...args);
  }

  async run(sql: string, ...args: any[]) {
    return this.db.run(sql, ...args);
  }

  async transaction(fn: (db: Connection) => Promise<void>) {
    const conn = await this.db.connect();
    await conn.run("begin");
    try {
      await fn(conn);
      await conn.run("commit");
    } catch (e) {
      await conn.run("rollback");
      throw e;
    } finally {
      await conn.close();
    }
  }

  async close() {
    await this.db.close();
  }
}
