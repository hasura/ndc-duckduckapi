import { db } from "./duckduckapi";
import { JSONValue } from '@hasura/ndc-lambda-sdk';

/**
 * This is the loader function which will start loading data into duckdb.
 * $promptql.__dda_loader // Do not remove this tag
 */
export async function __dda_loader_google_calendar(headers: JSONValue): Promise<string> {
    console.log(JSON.stringify(headers.value));
    insertLoop();
    return `Started loader...`;
}

// A simple data generator inserting every second.
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

/** @readonly */
export function hello(name: string, year: number): string {
    return `Hello ${name}, welcome to ${year}`
}

/** @readonly */
export function bye(name: string): string {
    return `Bye ${name}!`;
}

export async function sendEmail (email: string): Promise<string> {
    return `Email sent to: ${email}!`;
}
