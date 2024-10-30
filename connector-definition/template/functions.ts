import { JSONValue } from "@hasura/ndc-lambda-sdk";
import { GMail, GoogleCalendar } from "@hasura/ndc-duckduckapi/services";
import { getOAuthCredentialsFromHeader } from "@hasura/ndc-duckduckapi";
import { getDB } from "@hasura/ndc-duckduckapi";

/***********************************************************************************/
/************************** BUILT-IN EXAMPLES **************************************/
/***********************************************************************************/

/* To add more built in examples, check out other services at @hasura/ndc-duckduckapi/services */
const calendarLoaderState = {
  state: "Stopped",
};
let syncManager;

(async () => {
  try {
    console.log(
      "Trying to initialize calendar loader in case credentials are already available"
    );
    const calendarSyncManager = await GoogleCalendar.SyncManager.create(
      calendarLoaderState,
      1
    );
    await calendarSyncManager.initialize();
  } catch (error) {
    calendarLoaderState.state = `Stopped`;
    console.error(error);
  }
})();

/**
 * $ddn.jobs.calendar-loader.init
 */
export async function __dda_calendar_loader_init(
  headers: JSONValue
): Promise<string> {
  if (calendarLoaderState.state == "Running") {
    return calendarLoaderState.state;
  }

  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);

  if (
    !credentials ||
    !credentials["google-calendar"] ||
    !credentials["google-calendar"].access_token
  ) {
    console.log(credentials);
    calendarLoaderState.state = `Error in getting the google-calendar oauth credentials. Login to google-calendar?`;
    return calendarLoaderState.state;
  }

  syncManager = await GoogleCalendar.SyncManager.create(
    calendarLoaderState,
    1, // sync every minute
    credentials["google-calendar"]
  );

  return await syncManager.initialize();
}
/**
 *  $ddn.jobs.calendar-loader.status
 *
 *  @readonly
 * */
export function __dda_calendar_loader_status(): string {
  return calendarLoaderState.state;
}

/**
 * This is a function to create an event on your google calendar
 */
export async function createCalendarEvent(
  headers: JSONValue,
  summary: string,
  startDateTime: Date,
  endDateTime: Date,
  description?: string,
  attendees?: string[],
  timeZone?: string,
  location?: string
): Promise<{ success: boolean; message: string }> {
  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);

  if (
    !credentials ||
    !credentials["google-calendar"] ||
    !credentials["google-calendar"].access_token
  ) {
    console.log(credentials);
    return {
      success: false,
      message: `Error in getting the google-calendar oauth credentials. Login to google-calendar?`,
    };
  }

  const event = await GoogleCalendar.CreateCalendarEvent(
    credentials["google-calendar"],
    summary,
    description,
    startDateTime,
    endDateTime,
    attendees,
    timeZone,
    location
  );

  if (event.status === "error") {
    return { success: false, message: `Error creating event: ${event.error}` };
  } else {
    return { success: true, message: `Event created successfully: ${event}` };
  }
}

/***********************************************************************************************
 * GMAIL LOADER
 ***********************************************************************************************/
/* To add more built in examples, check out other services at @hasura/ndc-duckduckapi/services */
const gmailLoaderState = {
  state: "Stopped",
};

(async () => {
  try {
    console.log(
      "Trying to initialize gmail loader in case credentials are already available"
    );
    const gmailSyncManager = await GMail.SyncManager.create(
      gmailLoaderState,
      1
    );
    await gmailSyncManager.initialize();
  } catch (error) {
    gmailLoaderState.state = `Stopped`;
    console.error(error);
  }
})();

/**
 * $ddn.jobs.gmail-loader.init
 */
export async function __dda_gmail_loader_init(
  headers: JSONValue
): Promise<string> {
  if (gmailLoaderState.state == "Running") {
    return gmailLoaderState.state;
  }

  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);

  if (
    !credentials ||
    !credentials["google-gmail"] ||
    !credentials["google-gmail"].access_token
  ) {
    console.log(credentials);
    gmailLoaderState.state = `Error in getting the GMail oauth credentials. Login to google-gmail?`;
    return gmailLoaderState.state;
  }

  const syncManager = await GMail.SyncManager.create(
    gmailLoaderState,
    1, // sync every minute
    credentials["google-gmail"]
  );

  return await syncManager.initialize();
}

/**
 *  $ddn.jobs.gmail-loader.status
 *
 *  @readonly
 * */
export function __dda_gmail_loader_status(): string {
  return gmailLoaderState.state;
}

/**********************************************************************************************/
/***************************  Add your own loader  ********************************************/
/**********************************************************************************************/

const myLoaderState = {
  state: "This is an unimplemented loader. Edit it in functions.ts.",
};

/**
 * This is the loader function which will start loading data into duckdb.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace my-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job status method.
 * $ddn.jobs.my-loader.init
 */
export async function __dda_my_loader_init(
  headers: JSONValue
): Promise<string> {
  // If the loader is already running
  if (myLoaderState.state === "running") {
    return myLoaderState.state;
  }

  // Get the oauth credentials from the header
  let credentials;
  credentials = getOAuthCredentialsFromHeader(headers);
  console.log(credentials);

  // If the credentials are not found, return an error and update the status so that the user can login
  if (
    !credentials ||
    !credentials["my-service"] ||
    !credentials["my-service"].access_token
  ) {
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

/*******************************************************************************************/
/* Some other examples of custom actions you want to provide or APIs you want to wrap over */
/*******************************************************************************************/

/** @readonly */
export function testCalendar(headers: JSONValue): JSONValue {
  return new JSONValue({
    success: true,
  });
}

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
