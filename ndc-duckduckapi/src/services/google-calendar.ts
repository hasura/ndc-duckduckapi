import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { AsyncConnection } from "../duckdb-connection-manager";
import { db } from "../duckduckapi";
import { GaxiosResponse } from "gaxios";

// Add this function at the beginning of the file
function debugLog(...args: any[]) {
  if (process.env.DEBUG) {
    console.log(...args);
  }
}

export const Schema = `


CREATE TABLE IF NOT EXISTS calendar_events (
  id VARCHAR PRIMARY KEY,
  summary VARCHAR,
  description VARCHAR,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  creator_email VARCHAR,
  organizer_email VARCHAR,
  status VARCHAR,
  location VARCHAR,
  recurring_event_id VARCHAR,
  recurrence JSON, 
  transparency VARCHAR,
  visibility VARCHAR,
  ical_uid VARCHAR,
  attendees JSON,
  reminders JSON,
  conference_data JSON,
  color_id VARCHAR,
  original_start_time TIMESTAMP WITH TIME ZONE,
  extended_properties JSON,
  attachments JSON,
  html_link VARCHAR,
  meeting_type VARCHAR,
  sequence INTEGER,
  event_type VARCHAR,
  calendar_id VARCHAR,
  sync_status VARCHAR,
  last_synced TIMESTAMP WITH TIME ZONE,
  is_all_day BOOLEAN
);

COMMENT ON TABLE calendar_events IS 'This table contains events from google calendar. While querying this table keep the following in mind. 1) The title of the event is stored in the summary field. 2) typically add a filter to remove cancelled events by checking status != ''cancelled'' ';

CREATE TABLE IF NOT EXISTS sync_state (
  calendar_id VARCHAR PRIMARY KEY,
  sync_token VARCHAR,
  last_sync TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE sync_state IS 'This table contains the sync state for the calendar job. This is not a table that would typically be queried. The sync_token is used to sync incremental changes from the google calendar API.';

CREATE TABLE IF NOT EXISTS calendar_oauth2_client(
  client TEXT PRIMARY KEY
);

`

interface CalendarEvent {
  id: string;
  summary: string;
  description: string | null;
  start: string;
  end: string;
  created: string;
  updated: string;
  creator_email: string;
  organizer_email: string;
  status: string;
  location: string | null;
  recurring_event_id: string | null;
  recurrence: string | null;
  transparency: string | null;
  visibility: string | null;
  ical_uid: string;
  attendees: string | null;
  reminders: string | null;
  conference_data: string | null;
  color_id: string | null;
  original_start_time: string | null;
  extended_properties: string | null;
  attachments: string | null;
  html_link: string | null;
  meeting_type: string | null;
  sequence: number;
  event_type: string;
  calendar_id: string;
  sync_status: "active" | "deleted";
  last_synced: string;
  is_all_day: boolean;
}

interface SyncState {
  sync_token: string;
  last_sync: string;
}

interface LoaderState {
  state: string;
}

export class SyncManager {
  private calendar!: calendar_v3.Calendar;
  private syncInterval!: NodeJS.Timeout;
  private auth!: OAuth2Client;
  private loaderState!: LoaderState;
  private syncIntervalMinutes: number = 15;
  private credentials!: {
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    client_id?: string;
    client_secret?: string;
  };

  private constructor() {};

  static async create(
    loaderState: LoaderState,
    syncIntervalMinutes: number = 15,
    credentials?: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      client_id: string;
      client_secret: string;
    },
  ): Promise<SyncManager> {

    let loadedCredentials;
    if (!credentials) {
      const result: any = await db.query("SELECT client FROM calendar_oauth2_client");
      if (!result || result.length === 0) {
        throw new Error("No credentials provided or found in the database");
      }
      loadedCredentials = JSON.parse(result[0].client);
    } else {
      loadedCredentials = credentials;
      if (loadedCredentials.refresh_token && loadedCredentials.expires_in && loadedCredentials.client_id && loadedCredentials.client_secret) {
        await db.transaction(async (conn) => {
          await conn.run('DELETE FROM calendar_oauth2_client;');
          await conn.run('INSERT OR REPLACE INTO calendar_oauth2_client (client) VALUES (?);', JSON.stringify(credentials));
        });
      }
    }

    const instance = new SyncManager();
    instance.credentials = loadedCredentials;
    await instance.initializeAuth();
    instance.loaderState = loaderState;
    instance.syncIntervalMinutes = syncIntervalMinutes;
    return instance;
  }

  private async saveCredentials({access_token, refresh_token, expires_in}: {access_token: string | null | undefined, refresh_token: string | null | undefined, expires_in: number | null | undefined}): Promise<void> {
      const credentials = {
        access_token,
        refresh_token,
        expires_in,
        client_id: this.credentials.client_id,
        client_secret: this.credentials.client_secret,
      }
      if (credentials.refresh_token && credentials.expires_in && credentials.client_id && credentials.client_secret) {
        await db.transaction(async (conn) => {
          await conn.run('DELETE FROM calendar_oauth2_client;');
          await conn.run('INSERT OR REPLACE INTO calendar_oauth2_client (client) VALUES (?);', JSON.stringify(credentials));
        });
      }
  }

  private async initializeAuth(): Promise<void> {
    if (this.credentials?.client_id && this.credentials?.client_secret && this.credentials?.refresh_token && this.credentials?.expires_in) {
      this.auth = new OAuth2Client({
        clientId: this.credentials.client_id,
        clientSecret: this.credentials.client_secret,
        eagerRefreshThresholdMillis: 1000 // 60 seconds 
      });
    } else {
      this.auth = new OAuth2Client();
    }

    this.auth.setCredentials({
      access_token: this.credentials.access_token,
      refresh_token: this.credentials.refresh_token,
      expiry_date:  Date.now() + 3000 
      // expiry_date: this.credentials.expires_in ? Date.now() + this.credentials.expires_in * 1000 : undefined
    });

    this.calendar = google.calendar({ version: "v3", auth: this.auth });
  
    this.auth.on('tokens', (tokens) => {
      this.saveCredentials({
        access_token: tokens?.access_token, 
        refresh_token: this.credentials.refresh_token, 
        expires_in: tokens?.expiry_date ? ((tokens.expiry_date - Date.now()) / 1000) : undefined
      });
      console.log('GoogleCalendarLoader.Auth:: ' + 'Refreshed token saved.');
    });

    // this.auth.refreshAccessToken();
  }

  async test(): Promise<string> {
    // Fetch one event to check if everything is valid
    let calendarAccessResult: string;

    const response = await this.calendar.events.list({
      calendarId: "primary",
      maxResults: 1,
    });

    if (response.data.items) {
      debugLog(response.data.items);
      calendarAccessResult =
        "Test fetch from calendar successful. Starting loader...";
    } else {
      calendarAccessResult =
        "No items received in test fetch. Starting loader anyway...";
    }
    console.log('GoogleCalendarLoader:: ' + calendarAccessResult);
    return calendarAccessResult;
  }

  async initialize(): Promise<string> {
    
    // Test access to calendar by fetching one event
    this.loaderState.state = "Testing google-calendar access...";
    console.log('GoogleCalendarLoader.Initialize:: ' + this.loaderState.state);
    try {
      this.loaderState.state = await this.test();
    } catch (error) {
      this.loaderState.state = `Error in testing google-calendar access: ${error}. Have you logged in to google-calendar?`;
      console.log('GoogleCalendarLoader.Initialize:: ' + this.loaderState.state);
      return this.loaderState.state;
    }
  
    debugLog("Initializing sync manager...");
    this.loaderState.state = "Running";
    this.startPeriodicSync();

    process.on("SIGINT", async () => {
      await this.cleanup();
      process.exit(0);
    });
  
    return this.loaderState.state;
  }

  private async startPeriodicSync(): Promise<void> {
    // Perform initial sync
    await this.performIncrementalSync();

    // Schedule periodic syncs
    this.syncInterval = setInterval(
      async () => {
        try {
          await this.performIncrementalSync();
        } catch (error) {
          console.error("Periodic sync failed:", error);
          this.loaderState.state = "Job restart required. Error in periodic sync: " + error;
          clearInterval(this.syncInterval);
        }
      },
      this.syncIntervalMinutes * 30000,
    );
  }

  async performIncrementalSync(calendarId: string = "primary"): Promise<void> {
    debugLog(`Starting incremental sync for calendar: ${calendarId}`);
    try {

      let syncState, pageToken, syncToken;

      do {

        syncState = await this.getSyncState(calendarId);
        syncToken = syncState?.sync_token;

        const response = await this.calendar.events.list({
          calendarId,
          syncToken,
          pageToken,
          singleEvents: true,
          maxResults: 2500,
        }) as GaxiosResponse<calendar_v3.Schema$Events>;

        if (response.status !== 200) {
          throw new Error("Failed to fetch events. Job will be paused and require manual restart. Status: " + response.status + ': ' + response.statusText);
        }

        // Begin transaction to save events and update sync state
        await db.transaction(async (conn) => {

          if (response.data.items) {
            console.log('GoogleCalendarLoader:: ' + "Fetched " + response.data.items.length + " events.");
            await this.incrementallySaveEventsFromSyncResponse(response.data.items, calendarId, conn);
          }

          pageToken = response.data.nextPageToken || undefined;

          if (!pageToken && response.data.nextSyncToken) {
            await this.updateSyncState(calendarId, response.data.nextSyncToken, conn);
          }

        });

        console.log('GoogleCalendarLoader:: ' + "Processed " + response.data.items?.length + " events & updated sync state.");
      } while (pageToken);

      debugLog(`Completed incremental sync for calendar: ${calendarId}`);
    } catch (error) {

      if (this.isInvalidSyncTokenError(error)) {
        console.log('GoogleCalendarLoader:: ' + "Sync token invalid.");
        await this.performFullSync(calendarId);
        console.log('GoogleCalendarLoader:: ' + "Restarting incremental sync.");
        this.startPeriodicSync();
      } else {
        console.log('GoogleCalendarLoader:: ' + "Unable to process events. " + error);
        throw error; 
      }
    }
  }

  private async incrementallySaveEventsFromSyncResponse(
    events: calendar_v3.Schema$Event[],
    calendarId: string,
    conn: AsyncConnection
  ): Promise<void> {
  
    for (const event of events) {
      const formattedEvent = this.formatEventData(event, calendarId, new Date().toISOString());
      if (event.status === "cancelled") {
        // Check if this is a cancellation/exception of a recurring event
        if (event.recurringEventId) {
          debugLog('cancellation exception of a recurring event: ' + event.id + ': ' + event.summary + ' (recurring event id: ' + event.recurringEventId + ')');
          try {
            await this.insertEventsBatch([formattedEvent], conn);
          } catch (error) {
            debugLog('Error fetching parent event: ' + error);
          }
        }
        else {
          // Delete this single event
          try {
            const result = await conn.run("DELETE FROM calendar_events WHERE id = ?", event.id);
            debugLog("Deleted event: " + JSON.stringify(result));
          } catch (error) {
            console.log('GoogleCalendarLoader:: ' + 'Error deleting single event: ' + error);
          }
        }
      } else {
        // Insert/update this event
        debugLog('inserting event: ' + formattedEvent.id + ': ' + formattedEvent.summary);
        await this.insertEventsBatch([formattedEvent], conn);
      }
    }
  }

  private parseDateTime(
    dateTime: string | null | undefined,
    date: string | null | undefined,
  ): string {
    if (dateTime) {
      return dateTime;
    } else if (date) {
      // For all-day events, set time to midnight UTC
      return `${date}T00:00:00.000Z`;
    }
    return new Date().toISOString(); // fallback
  }

  private formatEventData(
    event: calendar_v3.Schema$Event,
    calendarId: string,
    timestamp: string,
  ): CalendarEvent {
    const isAllDay = Boolean(event.start?.date);
    return {
      id: event.id!,
      summary: event.summary || "",
      description: event.description || null,
      start: this.parseDateTime(event.start?.dateTime, event.start?.date),
      end: this.parseDateTime(event.end?.dateTime, event.end?.date),
      created: event.created || timestamp,
      updated: event.updated || timestamp,
      creator_email: event.creator?.email || "",
      organizer_email: event.organizer?.email || "",
      status: event.status || "",
      location: event.location || null,
      recurring_event_id: event.recurringEventId || null,
      recurrence: event.recurrence ? JSON.stringify(event.recurrence) : null,
      transparency: event.transparency || null,
      visibility: event.visibility || null,
      ical_uid: event.iCalUID || "",
      attendees: event.attendees ? JSON.stringify(event.attendees) : null,
      reminders: event.reminders ? JSON.stringify(event.reminders) : null,
      conference_data: event.conferenceData
        ? JSON.stringify(event.conferenceData)
        : null,
      color_id: event.colorId || null,
      original_start_time: event.originalStartTime
        ? this.parseDateTime(
            event.originalStartTime.dateTime,
            event.originalStartTime.date,
          )
        : null,
      extended_properties: event.extendedProperties
        ? JSON.stringify(event.extendedProperties)
        : null,
      attachments: event.attachments ? JSON.stringify(event.attachments) : null,
      html_link: event.htmlLink || null,
      meeting_type: this.determineMeetingType(event),
      sequence: event.sequence || 0,
      event_type: this.determineEventType(event),
      calendar_id: calendarId,
      sync_status: "active",
      last_synced: timestamp,
      is_all_day: isAllDay,
    };
  }

  private async insertEventsBatch(events: CalendarEvent[], conn: AsyncConnection): Promise<void> {
    if (events.length === 0) return;

    let values;
    for (const event of events) {
      try {
        // Create placeholders only for this chunk
        const placeholders = Array(31).fill("?").join(",");
        const stmt = `
            INSERT OR REPLACE INTO calendar_events (
              id,
              summary,
              description,
              start_time,
              end_time,
              created_at,
              updated_at,
              creator_email,
              organizer_email,
              status,
              location,
              recurring_event_id,
              recurrence,
              transparency,
              visibility,
              ical_uid,
              attendees,
              reminders,
              conference_data,
              color_id,
              original_start_time,
              extended_properties,
              attachments,
              html_link,
              meeting_type,
              sequence,
              event_type,
              calendar_id,
              sync_status,
              last_synced,
              is_all_day
            ) VALUES (${placeholders})`;

        values = [
          event.id,
          event.summary,
          event.description,
          event.start,
          event.end,
          event.created,
          event.updated,
          event.creator_email,
          event.organizer_email,
          event.status,
          event.location,
          event.recurring_event_id,
          event.recurrence,
          event.transparency,
          event.visibility,
          event.ical_uid,
          event.attendees,
          event.reminders,
          event.conference_data,
          event.color_id,
          event.original_start_time,
          event.extended_properties,
          event.attachments,
          event.html_link,
          event.meeting_type,
          event.sequence,
          event.event_type,
          event.calendar_id,
          event.sync_status,
          event.last_synced,
          event.is_all_day,
        ];

        const result: any = await conn.all(stmt, ...values);
        console.log('GoogleCalendarLoader:: ' + "Rows inserted: " + result.length);
        
      } catch (error) {
        debugLog(values);
        console.error(`Error inserting event:`, error);
        debugLog(`Error inserting event:`, event.id + ': ' + event.summary);
        throw error;
      }
    }
  }

  async performFullSync(calendarId: string = "primary"): Promise<void> {
    debugLog(`Resetting calendar: ${calendarId}`);
    try {
      await db.transaction(async (conn) => {

        const clearEvents: any = await conn.all("DELETE FROM calendar_events WHERE calendar_id = ?", calendarId);
        console.log('GoogleCalendarLoader:: ' + "Truncated rows before full sync: " + clearEvents.length);

        const clearSyncState: any = await conn.all("DELETE FROM sync_state WHERE calendar_id = ?", calendarId);
        console.log('GoogleCalendarLoader:: ' + "Deleted sync state: " + clearSyncState.length);

      });
    } catch (error) {
      console.log('GoogleCalendarLoader:: ' + 'Error in resetting calendar state: ' + error);
      throw error;
    }
  }

  private async getSyncState(calendarId: string): Promise<SyncState | null> {
    const result: any = await db.query(
      "SELECT sync_token, last_sync FROM sync_state WHERE calendar_id = ?",
      calendarId
    );
    if (!result || result.length === 0) {
      return null;
    }
    debugLog('Sync state: ' + result[0].sync_token + ' ' + result[0].last_sync);
    return {
      sync_token: result[0].sync_token,
      last_sync: result[0].last_sync,
    }
  }

  private async updateSyncState(
    calendarId: string,
    syncToken: string,
    conn: AsyncConnection
  ): Promise<void> {
    try {
      await conn.run(`INSERT OR REPLACE INTO sync_state (calendar_id, sync_token, last_sync)
         VALUES (?, ?, CURRENT_TIMESTAMP)`, calendarId, syncToken);
      console.log('GoogleCalendarLoader:: ' + 'Sync state updated: ' + syncToken + ': ' + calendarId);
    } catch (err) {
      debugLog(err);
      throw err;
    }
  }

  private isInvalidSyncTokenError(error: any): boolean {
    return error?.response?.status === 410;
  }

  private determineMeetingType(event: calendar_v3.Schema$Event): string {
    if (event.conferenceData) {
      return event.location ? "hybrid" : "virtual";
    }
    return "in-person";
  }

  private determineEventType(event: calendar_v3.Schema$Event): string {
    if (event.recurringEventId) {
      return "recurring_instance";
    }
    if (event.recurrence) {
      return "recurring";
    }
    return "single";
  }

  async cleanup(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
    await db.close();
  }
}

// Create calendar event function

export interface CreateEventParams {
  summary: string;
  description?: string;
  startDateTime: string | Date;
  endDateTime: string | Date;
  attendees?: string[];
  timeZone?: string;
  location?: string;
}

export async function createCalendarEvent(
  auth: OAuth2Client,
  params: CreateEventParams
): Promise<calendar_v3.Schema$Event> {
  try {
    const calendar = google.calendar({ version: 'v3', auth });
    
    const event: calendar_v3.Schema$Event = {
      summary: params.summary,
      description: params.description,
      start: {
        dateTime: new Date(params.startDateTime).toISOString(),
        timeZone: params.timeZone || 'UTC',
      },
      end: {
        dateTime: new Date(params.endDateTime).toISOString(),
        timeZone: params.timeZone || 'UTC',
      },
      location: params.location,
      attendees: params.attendees?.map(email => ({ email })),
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: event,
      sendUpdates: 'all', // Sends email notifications to attendees
    });

    return response.data;
  } catch (error) {
    console.error('Error creating calendar event:', error);
    throw error;
  }
}