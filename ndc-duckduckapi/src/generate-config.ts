import { NotSupported, ObjectType } from "@hasura/ndc-sdk-typescript";
import * as fs from "fs";
import { promisify } from "util";
import { DuckDBConfigurationSchema } from "./duckduckapi";
import { Database } from "duckdb-async";
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
let HASURA_CONFIGURATION_DIRECTORY = process.env[
  "HASURA_CONFIGURATION_DIRECTORY"
] as string | undefined;
if (
  HASURA_CONFIGURATION_DIRECTORY === undefined ||
  HASURA_CONFIGURATION_DIRECTORY.length === 0
) {
  HASURA_CONFIGURATION_DIRECTORY = ".";
}

const determineType = (t: string): string => {
  switch (t) {
    case "BIGINT":
      return "BigInt";
    case "BIT":
      return "String";
    case "BOOLEAN":
      return "Boolean";
    case "BLOB":
      return "String";
    case "DATE":
      return "String";
    case "DOUBLE":
      return "Float";
    case "HUGEINT":
      return "HugeInt";
    case "INTEGER":
      return "Int";
    case "INTERVAL":
      return "String";
    case "REAL":
      return "Float";
    case "FLOAT":
      return "Float";
    case "SMALLINT":
      return "Int";
    case "TIME":
      return "String";
    case "TIMESTAMP":
      return "Timestamp";
    case "TIMESTAMP WITH TIME ZONE":
      return "Timestamp";
    case "TINYINT":
      return "Int";
    case "UBIGINT":
      return "UBigInt";
    case "UHUGEINT":
      return "UHugeInt";
    case "UINTEGER":
      return "Int";
    case "USMALLINT":
      return "Int";
    case "UTINYINT":
      return "Int";
    case "UUID":
      return "String";
    case "VARCHAR":
      return "String";
    case "JSON":
      return "JSON";
    default:
      if (t.startsWith("DECIMAL")) {
        return "Float";
      }
      console.log(t);
      throw new NotSupported("Unsupported type", {});
  }
};

export async function generateConfig(
  db: Database
): Promise<DuckDBConfigurationSchema> {
  const tableNames: string[] = [];
  const tableAliases: { [k: string]: string } = {};
  const objectTypes: { [k: string]: ObjectType } = {};

  // Get all tables with their comments
  const tables = await db.all("SHOW ALL TABLES");

  // Get table comments
  const tableComments = await db.all(`
    SELECT table_name, comment 
    FROM duckdb_tables() 
    WHERE schema_name = 'main'
  `);

  // Create a map of table comments for easier lookup
  const tableCommentMap = new Map(
    tableComments.map((row) => [
      row.table_name,
      row.comment || "No description available",
    ])
  );

  // Get all column comments upfront
  const columnComments = await db.all(`
    SELECT table_name, column_name, comment 
    FROM duckdb_columns() 
    WHERE schema_name = 'main'
  `);

  // Create a nested map for column comments: table_name -> column_name -> comment
  const columnCommentMap = new Map();
  for (const row of columnComments) {
    if (!columnCommentMap.has(row.table_name)) {
      columnCommentMap.set(row.table_name, new Map());
    }
    columnCommentMap
      .get(row.table_name)
      .set(row.column_name, row.comment || "No description available");
  }

  for (let table of tables) {
    const tableName = table.name;
    const aliasName = `${table.database}.${table.schema}.${table.name}`;
    tableNames.push(tableName);
    tableAliases[tableName] = aliasName;

    if (!objectTypes[tableName]) {
      objectTypes[tableName] = {
        fields: {},
        description:
          tableCommentMap.get(tableName) || "No description available",
      };
    }

    for (let i = 0; i < table.column_names.length; i++) {
      const columnName = table.column_names[i];
      objectTypes[tableName]["fields"][columnName] = {
        type: {
          type: "nullable",
          underlying_type: {
            type: "named",
            name: determineType(table.column_types[i]),
          },
        },
        description:
          columnCommentMap.get(tableName)?.get(columnName) ||
          "No description available",
      };
    }
  }

  const res: DuckDBConfigurationSchema = {
    collection_names: tableNames,
    collection_aliases: tableAliases,
    object_types: objectTypes,
    functions: [],
    procedures: [],
  };
  return Promise.resolve(res);
}
