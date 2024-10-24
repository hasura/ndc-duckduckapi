import { JSONValue } from "@hasura/ndc-lambda-sdk";
import { CalendarSyncManager } from "@hasura/ndc-duckduckapi";
import { getTokensFromHeader } from "@hasura/ndc-duckduckapi";

export let loaderStatus: string = "stopped";

/**
 * This is the loader function which will start loading data into duckdb.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace sample-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job status method.
 * $ddn.jobs.sample-loader.init
 */
export async function __dda_loader_init(headers: JSONValue): Promise<string> {

  if (loaderStatus === "running") {
    return loaderStatus;
  }

  let access_token: string | null = null;
  try {
    access_token = getTokensFromHeader(headers, "google-calendar").access_token;
  } catch (error) {
    loaderStatus = `Error in getting the google-calendar oauth credentials: ${error}. Login to google-calendar?`;
    return loaderStatus;
  }

  if (!access_token) {
    console.log(headers.value);
    loaderStatus =
      "google-calendar access token not found in oauth services. Login to google-calendar?";
    return loaderStatus;
  }

  const syncManager = new CalendarSyncManager(
    access_token,
    1, // sync every minute
  );

  try {
    loaderStatus = await syncManager.test();
  } catch (error) {
    loaderStatus = `Error in testing google-calendar access: ${error}. Have you logged in to google-calendar?`;
    return loaderStatus;
  }

  console.log("Initializing sync manager");
  syncManager.initialize();
  loaderStatus = "running";
  process.on("SIGINT", async () => {
    await syncManager.cleanup();
    process.exit(0);
  });

  return loaderStatus;
}

/**
 *  Function that gives you the current status of the loader job.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace sample-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job init method.
 *  $ddn.jobs.sample-loader.status
 *
 *  @readonly
 * */
export function __dda_loader_status(): string {
  return loaderStatus;
}

/** @readonly */
export function hello(name: string, year: number): string {
  return `Hello ${name}, welcome to ${year}`;
}

/** @readonly */
export function bye(name: string): string {
  return `Bye ${name}!`;
}

export async function sendEmail(email: string): Promise<string> {
  return `Email sent to: ${email}!`;
}
