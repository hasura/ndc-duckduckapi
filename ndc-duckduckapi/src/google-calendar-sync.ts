import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { db } from "./duckduckapi";
import { readJsonConfigFile } from "typescript";

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

export class CalendarSyncManager {
  private calendar: calendar_v3.Calendar;
  private syncInterval?: NodeJS.Timeout;

  constructor(
    private accessToken: string,
    private syncIntervalMinutes: number = 15,
  ) {
    const auth = new OAuth2Client();
    auth.setCredentials({ access_token: accessToken });
    this.calendar = google.calendar({ version: "v3", auth });
  }

  async test(): Promise<string> {
    // Fetch one event to check if everything is valid
    let calendarAccessResult: string;

    const response = await this.calendar.events.list({
      calendarId: "primary",
      maxResults: 1,
    });
    if (response.data.items) {
      console.log(response.data.items);
      calendarAccessResult =
        "Test fetch from calendar successful. Starting loader...";
    } else {
      calendarAccessResult =
        "No items received in test fetch. Starting loader anyway...";
    }
    return calendarAccessResult;
  } 

  async initialize(): Promise<void> {
    await this.startPeriodicSync();
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
        }
      },
      this.syncIntervalMinutes * 60 * 1000,
    );
  }

  async performIncrementalSync(calendarId: string = "primary"): Promise<void> {
    console.log(`Starting incremental sync for calendar: ${calendarId}`);
    try {
      await db.run("BEGIN TRANSACTION");

      const syncState = await this.getSyncState(calendarId);
      let pageToken: string | undefined;
      let syncToken = syncState?.sync_token;

      do {
        const response = await this.calendar.events.list({
          calendarId,
          syncToken,
          pageToken,
          maxResults: 2500,
        });

        if (response.data.items) {
          await this.processSyncedEvents(response.data.items, calendarId);
        }

        pageToken = response.data.nextPageToken || undefined;

        if (!pageToken && response.data.nextSyncToken) {
          await this.updateSyncState(calendarId, response.data.nextSyncToken);
        }
      } while (pageToken);

      await db.run("COMMIT");
      console.log(`Completed incremental sync for calendar: ${calendarId}`);
    } catch (error) {
      await db.run("ROLLBACK");

      if (this.isInvalidSyncTokenError(error)) {
        console.log("Sync token invalid, performing full sync");
        await this.performFullSync(calendarId);
      } else {
        console.log("Unable to fetch events. " + error);
      }
    }
  }

  private async processSyncedEvents(
    events: calendar_v3.Schema$Event[],
    calendarId: string,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const BATCH_SIZE = 1000;
    let batch: CalendarEvent[] = [];

    for (const event of events) {
      const formattedEvent = this.formatEventData(event, calendarId, timestamp);

      if (event.status === "cancelled") {
        formattedEvent.sync_status = "deleted";
      }

      batch.push(formattedEvent);

      if (batch.length >= BATCH_SIZE) {
        await this.insertEventsBatch(batch);
        batch = [];
      }
    }

    if (batch.length > 0) {
      await this.insertEventsBatch(batch);
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

  private escapeValue(value: any): string {
    if (value === null) {
      return "NULL";
    }
    if (typeof value === "boolean") {
      return value ? "true" : "false";
    }
    if (typeof value === "number") {
      return value.toString();
    }
    if (typeof value === "string") {
      // Handle JSON strings
      if (value.startsWith("{") && value.endsWith("}")) {
        return `'${value.replace(/'/g, "''")}'::JSON`;
      }
      return `'${value.replace(/'/g, "''")}'`;
    }
    return "NULL";
  }

  private async insertEventsBatch(events: CalendarEvent[]): Promise<void> {
    if (events.length === 0) return;

    // Use a much smaller batch size to avoid parameter limits
    const BATCH_SIZE = 1000; // This means 50 * 31 = 1550 parameters max per statement

    try {
      // Process events in smaller chunks
      for (let i = 0; i < events.length; i += BATCH_SIZE) {
        const chunk = events.slice(i, i + BATCH_SIZE);

        // Create placeholders only for this chunk
        const placeholders = chunk
          .map(() => "(" + Array(31).fill("?").join(",") + ")")
          .join(",");

        const stmt = db.prepare(`
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
            ) VALUES ${placeholders}
          `);

        const values = chunk.flatMap((event) => [
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
        ]); // .map(this.escapeValue);

        try {
          await new Promise<void>((resolve, reject) => {
            stmt.all(...values, (err: Error | null, rows) => {
              if (err) {
                console.log(stmt.sql);
                console.log(err);
                console.log(values);
                reject(err);
                process.exit();
              } else {
                console.log("Affected rows: " + rows.length);
                resolve();
              }
            });
          });
        } catch (error) {
          console.error(`Error inserting batch at index ${i}:`, error);
          throw error; // Re-throw to trigger transaction rollback
        }
      }
    } catch (error) {
      console.error("Batch insert failed:", error);
      throw error;
    }
  }

  async performFullSync(calendarId: string = "primary"): Promise<void> {
    console.log(`Starting full sync for calendar: ${calendarId}`);
    try {
      await db.run("BEGIN TRANSACTION");

      let pageToken: string | undefined;
      do {
        const response = await this.calendar.events.list({
          calendarId,
          pageToken,
          maxResults: 2500,
          timeMin: new Date(0).toISOString(),
          timeMax: new Date().toISOString(),
          singleEvents: true,
          orderBy: "startTime",
        });

        if (response.data.items) {
          await this.processSyncedEvents(response.data.items, calendarId);
        }

        pageToken = response.data.nextPageToken || undefined;

        if (!pageToken && response.data.nextSyncToken) {
          await this.updateSyncState(calendarId, response.data.nextSyncToken);
        }
      } while (pageToken);

      await db.run("COMMIT");
      console.log(`Completed full sync for calendar: ${calendarId}`);
    } catch (error) {
      await db.run("ROLLBACK");
      throw error;
    }
  }

  private async getSyncState(calendarId: string): Promise<SyncState | null> {
    const stmt = await db.prepare(
      "SELECT sync_token, last_sync FROM sync_state WHERE calendar_id = ?",
    );
    // Using callback style
    return new Promise((resolve, reject) => {
      stmt.all(calendarId, (err, rows) => {
        if (err) {
          console.error(err);
          return resolve(null);
        }

        if (!rows || rows.length === 0) {
          return resolve(null);
        }

        return resolve({
          sync_token: rows[0].sync_token,
          last_sync: rows[0].last_sync,
        });
      });
    });
  }

  private async updateSyncState(
    calendarId: string,
    syncToken: string,
  ): Promise<void> {
    const stmt = await db.prepare(
      `INSERT OR REPLACE INTO sync_state (calendar_id, sync_token, last_sync)
       VALUES (?, ?, CURRENT_TIMESTAMP)`,
    );
    stmt.all(calendarId, syncToken, (err, rows) => {
      if (err) {
        console.log(stmt.sql);
        console.log(err);
      } else {
        console.log("Affected rows: " + rows.length);
      }
    });
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
