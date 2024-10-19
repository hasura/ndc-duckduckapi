import {start} from "@hasura/ndc-sdk-typescript";
import { makeConnector, duckduckapi, db} from "./duckduckapi";

// get any api credentials from env vars

const calendar: duckduckapi = {
  dbSchema: `
    CREATE TABLE IF NOT EXISTS users (id int, name string);
  `,

  getFunctions: () => {
      console.log("Getting functions...");
      // Implementation for retrieving functions
  },

  loaderJob: () => {
    console.log("Running loader job...");

    async function insertLoop() {
        let id = 100;
        while (true) {
          // Insert a row into the table
          await db.all(`
            INSERT INTO users (id, name) values (?, ?);
          `, id, 'name'+id.toString(), (err)=>{console.log(err)});
          id++;
          console.log(`Inserted row ${id}`);
      
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