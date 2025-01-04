/**
 * benchmark.ts
 *
 * Demonstrates two approaches to using DuckDB in a multi-tenant environment:
 *   1) Single DuckDB database (with tenant_id).
 *   2) Multiple DuckDB databases (one per tenant).
 */

import path from "path";
import fs from "fs-extra";
import { performance } from "perf_hooks";
import { Database } from "duckdb-async";

/* ---------------------------------- */
/*       CONFIG & CONSTANTS           */
/* ---------------------------------- */

const TENANTS_COUNT = 500;
const QUERIES_PER_TENANT = 20;

const BASE_SAMPLE_DB_PATH =
  "/home/nxo/Documents/202412171258-zendesk-example/app/connector/myduckduckapi/duck.db";
const SINGLE_TENANT_DB_PATH = "multitenant_test/single_approach.db";
const MULTI_TENANT_DB_DIR = "multitenant_test/multitenant_db_files";

/* ---------------------------------- */
/*       DATA SEEDING FUNCTIONS       */
/* ---------------------------------- */

/**
 * transferTickets
 *
 * Copies the entire contents of the 'tickets' table from sourceDbPath
 * into an existing 'tickets' table in targetDbPath using ATTACH.
 * (Assumes the target DB already has a schema for 'tickets'.)
 */
async function transferTickets(sourceDbPath: string, targetDbPath: string) {
  // Create connection to target database
  const targetDb = await Database.create(targetDbPath);

  // Attach source database
  await targetDb.exec(`ATTACH DATABASE '${sourceDbPath}' AS source`);

  // Copy all rows from source.tickets into target's tickets
  // This is a straight copy, so the target 'tickets' table schema
  // must match the source (except for additional columns like tenant_id).
  await targetDb.exec(`
      INSERT INTO tickets 
      SELECT *
      FROM source.tickets
  `);

  // Clean up
  await targetDb.exec("DETACH DATABASE source");
  await targetDb.close();
}

/**
 * Seeds the single DuckDB database for the multi-tenant approach:
 *   - Creates single_approach.db
 *   - Creates the tickets table (with tenant_id)
 *   - Attaches the source DB and transfers data 100 times (once per tenant)
 */
async function seedSingleDuckDB() {
  console.log("Seeding single-tenant approach duckdb database...");

  // Ensure the containing directory for SINGLE_TENANT_DB_PATH
  const singleDir = path.dirname(SINGLE_TENANT_DB_PATH);
  await fs.ensureDir(singleDir);

  // Create the single approach DB
  const singleDb = await Database.create(SINGLE_TENANT_DB_PATH);

  // Create the table with a tenant_id column
  await singleDb.run(`
    CREATE TABLE IF NOT EXISTS tickets (
      id BIGINT,
      url TEXT NOT NULL,
      subject TEXT,
      description TEXT,
      priority TEXT,
      status TEXT,
      type TEXT,
      via_channel TEXT,
      assignee_id BIGINT,
      requester_id BIGINT,
      submitter_id BIGINT,
      group_id BIGINT,
      organization_id BIGINT,
      brand_id BIGINT,
      created_at TIMESTAMP,
      updated_at TIMESTAMP,
      tags TEXT,
      tenant_id INT
    );
  `);

  // Attach the source DB; we'll copy rows in a loop, one pass per tenant_id
  await singleDb.exec(`ATTACH DATABASE '${BASE_SAMPLE_DB_PATH}' AS source`);

  // For each tenant, copy the data from source.tickets, setting tenant_id
  // TIP: If your DuckDB version supports generating sequences in SQL,
  //      you could do this in one query. Otherwise we do a loop:
  for (let tenantId = 1; tenantId <= TENANTS_COUNT; tenantId++) {
    await singleDb.exec(`
      INSERT INTO tickets
      SELECT
        t.id,
        t.url,
        t.subject,
        t.description,
        t.priority,
        t.status,
        t.type,
        t.via_channel,
        t.assignee_id,
        t.requester_id,
        t.submitter_id,
        t.group_id,
        t.organization_id,
        t.brand_id,
        t.created_at,
        t.updated_at,
        t.tags,
        ${tenantId} AS tenant_id
      FROM source.tickets AS t
    `);
  }

  await singleDb.exec("DETACH DATABASE source");
  await singleDb.close();

  console.log("Seeding single approach DB done!");
}

/**
 * Seeds multiple DuckDB databases: one DB per tenant.
 *   - Creates ./multitenant_test/multitenant_db_files/tenant_<id>.db
 *   - Each DB has its own 'tickets' table with no tenant_id column
 *   - Data is copied from the base sample DB using ATTACH
 */
async function seedMultipleDuckDBs() {
  console.log("Seeding multiple duckdb databases...");

  // Ensure the directory
  await fs.ensureDir(MULTI_TENANT_DB_DIR);

  // For each tenant, create a new DB and copy data from the source
  for (let tenantId = 1; tenantId <= TENANTS_COUNT; tenantId++) {
    const tenantDbFile = path.join(
      MULTI_TENANT_DB_DIR,
      `tenant_${tenantId}.db`
    );
    const tenantDb = await Database.create(tenantDbFile);

    // Create the tickets table (matching schema from source minus tenant_id)
    await tenantDb.run(`
      CREATE TABLE IF NOT EXISTS tickets (
        id BIGINT,
        url TEXT NOT NULL,
        subject TEXT,
        description TEXT,
        priority TEXT,
        status TEXT,
        type TEXT,
        via_channel TEXT,
        assignee_id BIGINT,
        requester_id BIGINT,
        submitter_id BIGINT,
        group_id BIGINT,
        organization_id BIGINT,
        brand_id BIGINT,
        created_at TIMESTAMP,
        updated_at TIMESTAMP,
        tags TEXT
      );
    `);

    await tenantDb.close();

    // Now use the transfer function to copy data from the source DB into this tenant's DB
    await transferTickets(BASE_SAMPLE_DB_PATH, tenantDbFile);
  }

  console.log("Seeding multiple approach DBs done!");
}

/* ---------------------------------- */
/*        QUERY & BENCHMARKING        */
/* ---------------------------------- */

/**
 * Runs one query for a single tenant (single DB approach).
 * It uses the tenant_id in the WHERE clause.
 */
async function runSingleDbQueryForTenant(tenantId: number, db: Database) {
  // Example query:
  // SELECT * FROM (SELECT * FROM tickets WHERE tenant_id = ${tenantId}) sub USING SAMPLE 10
  const sql = `
    SELECT *
    FROM (
      SELECT *
      FROM tickets
      WHERE tenant_id = ?
    ) sub
    USING SAMPLE 10;
  `;
  await db.all(sql, [tenantId]);
}

/**
 * Runs one query for a single tenant (multiple DB approach).
 * We open the tenant-specific database, run the query, and close the DB.
 */
async function runMultiDbQueryForTenant(tenantId: number) {
  const tenantDbFile = path.join(MULTI_TENANT_DB_DIR, `tenant_${tenantId}.db`);
  const tenantDb = await Database.create(tenantDbFile);

  // Example query:
  // SELECT * FROM (SELECT * FROM tickets) sub USING SAMPLE 10
  const sql = `
    SELECT *
    FROM (
      SELECT *
      FROM tickets
    ) sub
    USING SAMPLE 10;
  `;
  await tenantDb.all(sql);
  await tenantDb.close();
}

/**
 * Runs the full single-DB benchmark:
 *  - Opens a single DB connection that all tenants share.
 *  - Each of the 100 tenants runs 10 queries in sequence.
 *  - The 100 tenants run in parallel.
 */
async function runSingleDbBenchmark(): Promise<number> {
  console.log("Starting single DB benchmark...");
  const db = await Database.create(SINGLE_TENANT_DB_PATH);

  // For concurrency: create an array of Promises, one per tenant
  const tenantPromises = Array.from({ length: TENANTS_COUNT }, (_, idx) => {
    const tenantId = idx + 1;
    return (async () => {
      for (let i = 0; i < QUERIES_PER_TENANT; i++) {
        await runSingleDbQueryForTenant(tenantId, db);
      }
    })();
  });

  const t0 = performance.now();
  await Promise.all(tenantPromises);
  const t1 = performance.now();

  await db.close();
  console.log("Single DB benchmark complete!");
  return t1 - t0;
}

/**
 * Runs the full multi-DB benchmark:
 *  - Each tenant has their own DB file.
 *  - For each of the 100 tenants, we do 10 queries in sequence, each query
 *    opening the DB, running the query, then closing.
 *  - The 100 tenants run in parallel.
 */
async function runMultiDbBenchmark(): Promise<number> {
  console.log("Starting multiple DB benchmark...");

  const tenantPromises = Array.from({ length: TENANTS_COUNT }, (_, idx) => {
    const tenantId = idx + 1;
    return (async () => {
      for (let i = 0; i < QUERIES_PER_TENANT; i++) {
        await runMultiDbQueryForTenant(tenantId);
      }
    })();
  });

  const t0 = performance.now();
  await Promise.all(tenantPromises);
  const t1 = performance.now();

  console.log("Multiple DB benchmark complete!");
  return t1 - t0;
}

/* ---------------------------------- */
/*               MAIN                 */
/* ---------------------------------- */

async function main() {
  try {
    // 1) Cleanup old test data
    //    Remove the entire directory that stores both the single_approach.db
    //    and the multitenant_db_files folder
    // 2) Seed Data
    if (false) {
      await fs.remove("multitenant_test");
      await seedSingleDuckDB();
      await seedMultipleDuckDBs();
    }

    // 3) Run Single DB Benchmark
    const singleDbTime = await runSingleDbBenchmark();
    console.log(`Single DB total time: ${singleDbTime.toFixed(2)} ms`);

    // 4) Run Multiple DB Benchmark
    const multipleDbTime = await runMultiDbBenchmark();
    console.log(`Multiple DB total time: ${multipleDbTime.toFixed(2)} ms`);

    // 5) Compare
    console.log("====== Benchmark Results ======");
    console.log(`Single DB (ms):   ${singleDbTime.toFixed(2)}`);
    console.log(`Multiple DB (ms): ${multipleDbTime.toFixed(2)}`);
    console.log("===============================");
  } catch (error) {
    console.error("Error in benchmark:", error);
  }
}

// If you want to run this file directly with, e.g., `ts-node benchmark.ts`
if (require.main === module) {
  main().catch((err) => {
    console.error("Unhandled error:", err);
    process.exit(1);
  });
}
