import {start} from "@hasura/ndc-sdk-typescript";
import {makeConnector, duckduckapi} from "./duckduckapi";
import {readFileSync} from 'fs';
import {join} from 'path';

/* TODO:
- What is the easiest way to specify that I need to include a schema.sql file and and functions.ts file?
- Should the index.ts file be here kind of almost like a "don't" touch this file. You should just focus on the schema.sql and functions.ts files.
*/


const calendar: duckduckapi = {
  dbSchema: readFileSync(join(__dirname, 'schema.sql'), 'utf-8'),
  functionsFilePath: './functions.ts'
};

(async () => {
    const connector = await makeConnector(calendar);
    start(connector);
})();
