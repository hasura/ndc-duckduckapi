import { JSONValue } from '@hasura/ndc-lambda-sdk';
import { CalendarSyncManager } from './google-calendar-sync';

export let loaderStatus: string = 'stopped';

/**
 * This is the loader function which will start loading data into duckdb.
 *  // Mark your functions with this annotation to see it in the console
 *  // Replace sample-loader to create your own unique name, eg: my-saas-loader, and to group it with the right job status method.
 * $ddn.jobs.sample-loader.init
 */
export async function __dda_loader_init(headers: JSONValue): Promise<string> {

    console.log(JSON.stringify(headers.value));

    const syncManager = new CalendarSyncManager(
      headers.value['google-calendar'].token,
      1 // sync every 5 minutes
    );
    const result = await syncManager.test();
    
    if (!result) {
      loaderStatus = result + '. Have you logged in to google-calendar?';
    }

    syncManager.initialize();
    loaderStatus = 'running';
    process.on('SIGINT', async () => {
        await syncManager.cleanup();
        process.exit(0);
    });

    return result;
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
    return `Hello ${name}, welcome to ${year}`
}

/** @readonly */
export function bye(name: string): string {
    return `Bye ${name}!`;
}

export async function sendEmail (email: string): Promise<string> {
    return `Email sent to: ${email}!`;
}
