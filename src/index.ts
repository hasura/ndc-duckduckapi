import {start} from "@hasura/ndc-sdk-typescript";
import { makeConnector, duckduckapi, db, deriveTypes} from "./duckduckapi";
import * as duckdb from "duckdb";

const derivedTypes = deriveTypes('./functions.ts');
console.log(derivedTypes);

const calendar: duckduckapi = {

  dbSchema: `
    CREATE TABLE IF NOT EXISTS users (id int, name string);
    CREATE TABLE IF NOT EXISTS articles (id int, title string);
  `,

  loaderJob: (db: duckdb.Database) => {
    console.log("Running loader job...");
    async function insertLoop() {
        let id = 100;
        while (true) {
          const con = db.connect();
          // Insert a row into the table
          con.exec('BEGIN TRANSACTION');
          con.all(`
            INSERT INTO users (id, name) values (?, ?);
          `, id, 'name'+id.toString(), (err)=>{console.log(err)});
          con.run('COMMIT');
          id++;
          console.log(`Inserted row ${id}`);
          con.close();
          // Wait for 1 second before the next insertion
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    insertLoop();
  },

  getFunctions: () => {
      console.log("Getting functions...");
      // Implementation for retrieving functions
  },

};

(async () => {
    const connector = await makeConnector(calendar);
    start(connector);  
})();