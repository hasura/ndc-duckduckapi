import {start} from "@hasura/ndc-sdk-typescript";
import {makeConnector, duckduckapi, db} from "./duckduckapi";

const calendar: duckduckapi = {
  dbSchema: `
    CREATE TABLE IF NOT EXISTS users (id int, name string);
    CREATE TABLE IF NOT EXISTS articles (id int, title string);
  `,
  functionsFilePath: './functions.ts'
};

(async () => {
    const connector = await makeConnector(calendar);
    start(connector);  
})();
