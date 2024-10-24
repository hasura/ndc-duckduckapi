import { start } from "@hasura/ndc-duckduckapi";
import { makeConnector, duckduckapi } from "@hasura/ndc-duckduckapi";
import * as path from "path";
import { readFileSync } from "fs";

const calendar: duckduckapi = {
  dbSchema: readFileSync(path.join(__dirname, "schema.sql"), "utf-8"),
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
};

(async () => {
  const connector = await makeConnector(calendar);
  start(connector);
})();
