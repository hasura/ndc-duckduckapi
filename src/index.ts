import {start} from "@hasura/ndc-sdk-typescript";
import { makeConnector, duckduckapi, db} from "./duckduckapi";
import * as duckdb from "duckdb";
// get any api credentials from env vars

const calendar: duckduckapi = {
  // DROP TABLE IF EXISTS users;
  dbSchema: `
    CREATE TABLE IF NOT EXISTS users (id int, name string);
  `,

  getFunctions: () => {
      console.log("Getting functions...");
      // Implementation for retrieving functions
  },

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
  }
};

(async () => {
    const connector = await makeConnector(calendar);
    start(connector);  
})();