// From original index.ts
import { start } from "@hasura/ndc-duckduckapi";
import { makeConnector, duckduckapi } from "@hasura/ndc-duckduckapi";
import * as path from "path";
import { GoogleCalendar, GMail} from "@hasura/ndc-duckduckapi/services";

const connectorConfig: duckduckapi = {
  dbSchema: `

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