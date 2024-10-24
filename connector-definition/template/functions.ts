import { JSONValue } from "@hasura/ndc-lambda-sdk";
import { GoogleCalendar } from "@hasura/ndc-duckduckapi/services";
import { getOAuthCredentialsFromHeader } from "@hasura/ndc-duckduckapi";


const myLoaderState = {
  state: 'unimplemented'
}

/**
 * This is the loader function which will start loading data into duckdb.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace my-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job status method.
 * $ddn.jobs.my-loader.init
 */
export async function __dda_my_loader_init(headers: JSONValue): Promise<string> {

  // If the loader is already running, return the current state
  if (myLoaderState.state === "running") {
    return myLoaderState.state;
  }

  // Get the oauth credentials from the header
  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);
  console.log(credentials);

  // If the credentials are not found, return an error and update the status so that the user can login
  if (!credentials || !credentials['my-service'] || !credentials['my-service'].access_token) {
    myLoaderState.state = `Error in getting the my-service oauth credentials. Login to my-service?`;
    return myLoaderState.state;
  }

  /* Implement the logic to load data from my-service into duckdb 
  
  1. Use the credentials to do a quick syncronous test if access to my-service is successful
  2. If yes, then update your loader state to running and initialize the loader and make it run asynchronously
  3. Return the loader state 

  */

  return myLoaderState.state;
}

/**
 *  Function that gives you the current status of the loader job.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace sample-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job init method.
 *  $ddn.jobs.my-loader.status
 *
 *  @readonly
 * */
export function __dda_my_loader_status(): string {
  return myLoaderState.state;
}

/* Some other examples of custom actions you want to provide or APIs you want to wrap over */
/** @readonly */
export function hello(name: string, year: number): string {
  return `Helloooo ${name}, welcome to ${year}`;
}

/** @readonly */
export function bye(name: string): string {
  return `Bye ${name}!`;
}

export async function sendEmail(email: string): Promise<string> {
  return `Email sent to: ${email}!`;
}


/************************** BUILT-IN EXAMPLES ************************************* */

/* To add more built in examples, check out other services at @hasura/ndc-duckduckapi/services */
const calendarLoaderState = {
  state: 'stopped'
}

/**
 * This is the loader function which will start loading data into duckdb.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace sample-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job status method.
 * $ddn.jobs.calendar-loader.init
 */
export async function __dda_calendar_loader_init(headers: JSONValue): Promise<string> {

  if (calendarLoaderState.state === "running") {
    return calendarLoaderState.state;
  }

  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);

  if (!credentials || !credentials['google-calendar'] || !credentials['google-calendar'].access_token) {
    console.log(credentials);
    calendarLoaderState.state = `Error in getting the google-calendar oauth credentials. Login to google-calendar?`;
    return calendarLoaderState.state;
  }

  const syncManager = new GoogleCalendar.syncManager (
    credentials['google-calendar'].access_token,
    1, // sync every minute
    calendarLoaderState
  );

  return await syncManager.initialize();
 
}

/**
 *  @readonly
 * */
export function __dda_calendar_loader_status(): string {
  return calendarLoaderState.state;
}

