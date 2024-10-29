// From original index.ts
import { start } from "@hasura/ndc-duckduckapi";
import { makeConnector, duckduckapi } from "@hasura/ndc-duckduckapi";
import * as path from "path";
import { GoogleCalendar, GMail} from "@hasura/ndc-duckduckapi/services";

const connectorConfig: duckduckapi = {
  dbSchema: `

    DROP TABLE IF EXISTS users;
    CREATE TABLE users (
    id integer primary key,
    name text
    );

    INSERT INTO users (id, name) VALUES
    (1, 'Alice Johnson'),
    (2, 'Bob Smith'),
    (3, 'Carol Martinez'),
    (4, 'David Kim'),
    (5, 'Emma Wilson'),
    (6, 'Frank Zhang'),
    (7, 'Grace Lee'),
    (8, 'Henry Garcia'),
    (9, 'Isabel Patel'),
    (10, 'Jack Thompson');
    -- Add your SQL schema here.
    -- This SQL will be run on startup every time.
    -- CREATE TABLE SAAS_TABLE_NAME (.....);

  ` + GoogleCalendar.Schema 
    + GMail.Schema,
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
};
 
(async () => {
  const connector = await makeConnector(connectorConfig);
  start(connector);
})();
