import { google, gmail_v1 } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { getDB, transaction } from "../duckduckapi";
import { Connection } from "duckdb-async";

// Debug logging helper
function debugLog(...args: any[]) {
  if (process.env.DEBUG) {
    console.log(...args);
  }
}

export const Schema = `
CREATE TABLE IF NOT EXISTS gmail_messages (
  id VARCHAR PRIMARY KEY,
  thread_id VARCHAR,
  label_ids JSON,
  snippet TEXT,
  history_id VARCHAR,
  internal_date TIMESTAMP WITH TIME ZONE,
  size_estimate INTEGER,
  raw_size INTEGER,
  message_id VARCHAR,
  subject VARCHAR,
  from_address VARCHAR,
  to_addresses TEXT,
  cc_addresses TEXT,
  bcc_addresses TEXT,
  date TIMESTAMP WITH TIME ZONE,
  body_plain TEXT,
  body_html TEXT,
  attachment_count INTEGER,
  attachments TEXT,
  headers TEXT,
  sync_status VARCHAR,
  last_synced TIMESTAMP WITH TIME ZONE,
  is_draft BOOLEAN,
  is_sent BOOLEAN,
  is_inbox BOOLEAN,
  is_trash BOOLEAN,
  is_unread BOOLEAN,
  is_starred BOOLEAN
);

COMMENT ON TABLE gmail_messages IS 'This table contains messages from Gmail. Common filters include is_inbox = true to get inbox messages, is_unread = true for unread messages, etc.';

CREATE TABLE IF NOT EXISTS gmail_sync_state (
  user_id VARCHAR PRIMARY KEY,
  history_id VARCHAR,
  last_sync TIMESTAMP WITH TIME ZONE
);

COMMENT ON TABLE gmail_sync_state IS 'This table contains the sync state for the Gmail sync job. The history_id is used to sync incremental changes from the Gmail API.';

CREATE TABLE IF NOT EXISTS gmail_oauth2_client (
  client TEXT PRIMARY KEY
);
`;

interface GmailMessage {
  id: string;
  thread_id: string;
  label_ids: string | null;
  snippet: string | null;
  history_id: string;
  internal_date: string;
  size_estimate: number;
  raw_size: number;
  message_id: string;
  subject: string | null;
  from_address: string | null;
  to_addresses: string | null;
  cc_addresses: string | null;
  bcc_addresses: string | null;
  date: string;
  body_plain: string | null;
  body_html: string | null;
  attachment_count: number;
  attachments: string | null;
  headers: string | null;
  sync_status: "active" | "deleted";
  last_synced: string;
  is_draft: boolean;
  is_sent: boolean;
  is_inbox: boolean;
  is_trash: boolean;
  is_unread: boolean;
  is_starred: boolean;
}

interface SyncState {
  history_id: string;
  last_sync: string;
}

interface LoaderState {
  state: string;
}

export class SyncManager {
  private gmail!: gmail_v1.Gmail;
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

  private constructor() {}

  static async create(
    loaderState: LoaderState,
    syncIntervalMinutes: number = 15,
    credentials?: {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      client_id: string;
      client_secret: string;
    }
  ): Promise<SyncManager> {
    const db = await getDB();
    let loadedCredentials;
    if (!credentials) {
      const result: any = await db.all(
        "SELECT client FROM gmail_oauth2_client"
      );
      if (!result || result.length === 0) {
        throw new Error("No credentials provided or found in the database");
      }
      loadedCredentials = JSON.parse(result[0].client);
    } else {
      loadedCredentials = credentials;
      if (
        loadedCredentials.refresh_token &&
        loadedCredentials.expires_in &&
        loadedCredentials.client_id &&
        loadedCredentials.client_secret
      ) {
        await transaction(db, async (conn) => {
          await conn.run("DELETE FROM gmail_oauth2_client;");
          await conn.run(
            "INSERT OR REPLACE INTO gmail_oauth2_client (client) VALUES (?);",
            JSON.stringify(credentials)
          );
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

  private async saveCredentials({
    access_token,
    refresh_token,
    expires_in,
  }: {
    access_token: string | null | undefined;
    refresh_token: string | null | undefined;
    expires_in: number | null | undefined;
  }): Promise<void> {
    const credentials = {
      access_token,
      refresh_token,
      expires_in,
      client_id: this.credentials.client_id,
      client_secret: this.credentials.client_secret,
    };
    if (
      credentials.refresh_token &&
      credentials.expires_in &&
      credentials.client_id &&
      credentials.client_secret
    ) {
      await transaction(await getDB(), async (conn) => {
        await conn.run("DELETE FROM gmail_oauth2_client;");
        await conn.run(
          "INSERT OR REPLACE INTO gmail_oauth2_client (client) VALUES (?);",
          JSON.stringify(credentials)
        );
      });
    }
  }

  private async initializeAuth(): Promise<void> {
    if (
      this.credentials?.client_id &&
      this.credentials?.client_secret &&
      this.credentials?.refresh_token &&
      this.credentials?.expires_in
    ) {
      this.auth = new OAuth2Client({
        clientId: this.credentials.client_id,
        clientSecret: this.credentials.client_secret,
        eagerRefreshThresholdMillis: 30000,
      });
    } else {
      this.auth = new OAuth2Client();
    }

    this.auth.setCredentials({
      access_token: this.credentials.access_token,
      refresh_token: this.credentials.refresh_token,
      expiry_date: this.credentials?.expires_in
        ? Date.now() + (this.credentials.expires_in || 0) * 1000
        : undefined,
    });

    this.gmail = google.gmail({ version: "v1", auth: this.auth });

    this.auth.on("tokens", (tokens) => {
      this.saveCredentials({
        access_token: tokens?.access_token,
        refresh_token: this.credentials.refresh_token,
        expires_in: tokens?.expiry_date
          ? (tokens.expiry_date - Date.now()) / 1000
          : undefined,
      });
      console.log("GmailLoader.Auth:: " + "Refreshed token saved.");
    });
  }

  async test(): Promise<string> {
    let gmailAccessResult: string;

    const response = await this.gmail.users.messages.list({
      userId: "me",
      maxResults: 1,
    });

    if (response.data.messages) {
      debugLog(response.data.messages);
      gmailAccessResult =
        "Test fetch from Gmail successful. Starting loader...";
    } else {
      gmailAccessResult =
        "No messages received in test fetch. Starting loader anyway...";
    }
    console.log("GmailLoader:: " + gmailAccessResult);
    return gmailAccessResult;
  }

  async initialize(): Promise<string> {
    this.loaderState.state = "Testing Gmail access...";
    console.log("GmailLoader.Initialize:: " + this.loaderState.state);
    try {
      this.loaderState.state = await this.test();
    } catch (error) {
      this.loaderState.state = `Error in testing Gmail access: ${error}. Have you logged in to Gmail?`;
      console.log("GmailLoader.Initialize:: " + this.loaderState.state);
      return this.loaderState.state;
    }

    debugLog("Initializing sync manager...");
    this.loaderState.state = "Running";
    this.startPeriodicSync();

    process.on("SIGINT", async () => {
      await this.cleanup();
    });

    return this.loaderState.state;
  }

  private async startPeriodicSync(): Promise<void> {
    await this.performIncrementalSync();

    this.syncInterval = setInterval(async () => {
      try {
        await this.performIncrementalSync();
      } catch (error) {
        console.error("Periodic sync failed:", error);
        this.loaderState.state =
          "Job restart required. Error in periodic sync: " + error;
        clearInterval(this.syncInterval);
      }
    }, this.syncIntervalMinutes * 60000);
  }

  async performIncrementalSync(userId: string = "me"): Promise<void> {
    debugLog(`Starting incremental sync for user: ${userId}`);
    try {
      const syncState = await this.getSyncState(userId);
      const startHistoryId = syncState?.history_id;

      if (startHistoryId) {
        // Get history of changes
        const history = await this.gmail.users.history.list({
          userId,
          startHistoryId,
        });

        try {
          // Begin transaction to save messages and update sync state
          await transaction(await getDB(), async (conn) => {
            if (history.data.history) {
              await this.processHistoryChanges(
                history.data.history,
                userId,
                conn
              );
            }

            // Update sync state with latest history ID
            if (history.data.historyId) {
              await this.updateSyncState(userId, history.data.historyId, conn);
            }
          });
        } catch (error) {
          throw error;
        }
      } else {
        // No previous sync state, perform full sync
        await this.performFullSync(userId);
      }

      debugLog(`Completed incremental sync for user: ${userId}`);
    } catch (error) {
      if (this.isInvalidHistoryIdError(error)) {
        console.log(
          "GmailLoader:: " + "History ID invalid, performing full sync"
        );
        await this.performFullSync(userId);
      } else {
        console.log("GmailLoader:: " + "Unable to process messages. " + error);
        throw error;
      }
    }
  }

  private async processHistoryChanges(
    history: gmail_v1.Schema$History[],
    userId: string,
    conn: Connection
  ): Promise<void> {
    try {
      for (const record of history) {
        // Handle message additions
        if (record.messagesAdded) {
          for (const messageAdded of record.messagesAdded) {
            if (messageAdded.message) {
              const fullMessage = await this.gmail.users.messages.get({
                userId,
                id: messageAdded.message.id!,
                format: "full",
              });
              await this.processMessage(fullMessage.data, userId, conn);
            }
          }
        }

        // Handle message deletions
        if (record.messagesDeleted) {
          for (const messageDeleted of record.messagesDeleted) {
            if (messageDeleted.message?.id) {
              await conn.run(
                "UPDATE gmail_messages SET sync_status = 'deleted', last_synced = CURRENT_TIMESTAMP WHERE id = ?",
                messageDeleted.message.id
              );
            }
          }
        }

        // Handle label changes
        if (record.labelsAdded || record.labelsRemoved) {
          const messageId =
            record.labelsAdded?.[0]?.message?.id ||
            record.labelsRemoved?.[0]?.message?.id;
          if (messageId) {
            const fullMessage = await this.gmail.users.messages.get({
              userId,
              id: messageId,
              format: "full",
            });
            await this.processMessage(fullMessage.data, userId, conn);
          }
        }
      }
    } catch (error) {
      throw error;
    }
  }

  private async processMessage(
    message: gmail_v1.Schema$Message,
    userId: string,
    conn: Connection
  ): Promise<void> {
    const formattedMessage = await this.formatMessageData(message, userId);
    await this.insertMessageBatch([formattedMessage], conn);
  }

  private async formatMessageData(
    message: gmail_v1.Schema$Message,
    userId: string
  ): Promise<GmailMessage> {
    const headers = message.payload?.headers || [];
    const subject = headers.find(
      (h) => h.name?.toLowerCase() === "subject"
    )?.value;
    const from = headers.find((h) => h.name?.toLowerCase() === "from")?.value;
    const to = headers.find((h) => h.name?.toLowerCase() === "to")?.value;
    const cc = headers.find((h) => h.name?.toLowerCase() === "cc")?.value;
    const bcc = headers.find((h) => h.name?.toLowerCase() === "bcc")?.value;
    const date = headers.find((h) => h.name?.toLowerCase() === "date")?.value;

    const labelIds = message.labelIds || [];
    const attachments = this.extractAttachments(message.payload);
    const { plainText, htmlContent } = this.extractBody(message.payload);

    const now = formatDate(new Date());

    return {
      id: message.id!,
      thread_id: message.threadId!,
      label_ids: JSON.stringify(labelIds),
      snippet: message.snippet || null,
      history_id: message.historyId!,
      internal_date: formatDate(new Date(parseInt(message.internalDate!))),
      size_estimate: message.sizeEstimate || 0,
      raw_size: message.payload?.body?.size || 0,
      message_id:
        headers.find((h) => h.name?.toLowerCase() === "message-id")?.value ||
        "",
      subject: subject || null,
      from_address: from || null,
      to_addresses: to
        ? JSON.stringify(to.split(",").map((e) => e.trim()))
        : null,
      cc_addresses: cc
        ? JSON.stringify(cc.split(",").map((e) => e.trim()))
        : null,
      bcc_addresses: bcc
        ? JSON.stringify(bcc.split(",").map((e) => e.trim()))
        : null,
      date: date ? formatDate(new Date(date)) : now,
      body_plain: plainText,
      body_html: htmlContent,
      attachment_count: attachments.length,
      attachments: JSON.stringify(attachments),
      headers: JSON.stringify(headers),
      sync_status: "active",
      last_synced: now,
      is_draft: labelIds.includes("DRAFT"),
      is_sent: labelIds.includes("SENT"),
      is_inbox: labelIds.includes("INBOX"),
      is_trash: labelIds.includes("TRASH"),
      is_unread: labelIds.includes("UNREAD"),
      is_starred: labelIds.includes("STARRED"),
    };
  }

  private extractAttachments(payload?: gmail_v1.Schema$MessagePart): Array<{
    id: string;
    filename: string;
    mimeType: string;
    size: number;
  }> {
    const attachments: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
    }> = [];

    const processPartForAttachments = (part: gmail_v1.Schema$MessagePart) => {
      if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: part.mimeType || "application/octet-stream",
          size: part.body.size || 0,
        });
      }

      if (part.parts) {
        part.parts.forEach(processPartForAttachments);
      }
    };

    if (payload) {
      processPartForAttachments(payload);
    }

    return attachments;
  }

  private extractBody(payload?: gmail_v1.Schema$MessagePart): {
    plainText: string | null;
    htmlContent: string | null;
  } {
    let plainText: string | null = null;
    let htmlContent: string | null = null;

    const processPartForContent = (part: gmail_v1.Schema$MessagePart) => {
      if (!part.filename) {
        // Skip attachments
        if (part.mimeType === "text/plain") {
          plainText = Buffer.from(part.body?.data || "", "base64").toString(
            "utf-8"
          );
        } else if (part.mimeType === "text/html") {
          htmlContent = Buffer.from(part.body?.data || "", "base64").toString(
            "utf-8"
          );
        }
      }

      if (part.parts) {
        part.parts.forEach(processPartForContent);
      }
    };

    if (payload) {
      processPartForContent(payload);
    }

    return { plainText, htmlContent };
  }

  private async insertMessageBatch(
    messages: GmailMessage[],
    conn: Connection
  ): Promise<void> {
    if (messages.length === 0) return;

    for (const message of messages) {
      try {
        const placeholders = Array(28).fill("?").join(",");
        const stmt = `
          INSERT OR REPLACE INTO gmail_messages (
            id,
            thread_id,
            label_ids,
            snippet,
            history_id,
            internal_date,
            size_estimate,
            raw_size,
            message_id,
            subject,
            from_address,
            to_addresses,
            cc_addresses,
            bcc_addresses,
            date,
            body_plain,
            body_html,
            attachment_count,
            attachments,
            headers,
            sync_status,
            last_synced,
            is_draft,
            is_sent,
            is_inbox,
            is_trash,
            is_unread,
            is_starred
          ) VALUES (${placeholders})`;

        const values = [
          message.id,
          message.thread_id,
          message.label_ids,
          message.snippet,
          message.history_id,
          message.internal_date,
          message.size_estimate,
          message.raw_size,
          message.message_id,
          message.subject,
          message.from_address,
          message.to_addresses,
          message.cc_addresses,
          message.bcc_addresses,
          message.date,
          message.body_plain,
          message.body_html,
          message.attachment_count,
          message.attachments,
          message.headers,
          message.sync_status,
          message.last_synced,
          message.is_draft,
          message.is_sent,
          message.is_inbox,
          message.is_trash,
          message.is_unread,
          message.is_starred,
        ];

        const result: any = await conn.all(stmt, ...values);
        console.log(
          "GmailLoader:: " + "Message inserted/updated: " + message.id
        );
      } catch (error) {
        debugLog(error);
        console.error(`Error inserting message:`, error);
        debugLog(`Error inserting message:`, message.id);
        throw error;
      }
    }
  }

  async performFullSync(userId: string = "me"): Promise<void> {
    const db = await getDB();
    debugLog(`Starting full sync for user: ${userId}`);
    try {
      await transaction(db, async (conn) => {
        // Clear existing messages for this user
        await conn.run("DELETE FROM gmail_messages");
        console.log(
          "GmailLoader:: " + "Cleared existing messages for full sync"
        );

        // Clear sync state
        await conn.run(
          "DELETE FROM gmail_sync_state WHERE user_id = ?",
          userId
        );
        console.log("GmailLoader:: " + "Cleared sync state for full sync");
      });

      let pageToken: string | undefined;
      do {
        const response = await this.gmail.users.messages.list({
          userId,
          maxResults: 100,
          pageToken,
        });

        if (response.data.messages) {
          for (const messageInfo of response.data.messages) {
            const fullMessage = await this.gmail.users.messages.get({
              userId,
              id: messageInfo.id!,
              format: "full",
            });
            await transaction(db, async (conn) => {
              await this.processMessage(fullMessage.data, userId, conn);
            });
          }
        }

        pageToken = response.data.nextPageToken || undefined;
      } while (pageToken);

      // Update sync state with latest history ID
      const profile = await this.gmail.users.getProfile({ userId });
      if (profile.data.historyId) {
        const historyId = profile.data.historyId;
        await transaction(db, async (conn) => {
          await this.updateSyncState(userId, historyId, conn);
        });
      }

      console.log("GmailLoader:: " + "Full sync completed successfully");
    } catch (error) {
      console.error("Full sync failed:", error);
      throw error;
    }
  }

  private async getSyncState(userId: string): Promise<SyncState | null> {
    const db = await getDB();
    const result: any = await db.all(
      "SELECT history_id, last_sync FROM gmail_sync_state WHERE user_id = ?",
      userId
    );
    if (!result || result.length === 0) {
      return null;
    }
    debugLog("Sync state:", result[0]);
    return {
      history_id: result[0].history_id,
      last_sync: result[0].last_sync,
    };
  }

  private async updateSyncState(
    userId: string,
    historyId: string,
    conn: Connection
  ): Promise<void> {
    try {
      await conn.run(
        `INSERT OR REPLACE INTO gmail_sync_state (user_id, history_id, last_sync)
         VALUES (?, ?, CURRENT_TIMESTAMP)`,
        userId,
        historyId
      );
      console.log("GmailLoader:: " + "Sync state updated:", historyId);
    } catch (err) {
      debugLog(err);
      throw err;
    }
  }

  private isInvalidHistoryIdError(error: any): boolean {
    return (
      error?.response?.status === 404 &&
      error?.response?.data?.error?.message?.includes("historyId")
    );
  }

  async cleanup(): Promise<void> {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }
  }
}

function formatDate(date: Date) {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  const ms = pad(date.getMilliseconds(), 3);

  const offset = -date.getTimezoneOffset();
  const offsetHours = pad(Math.abs(Math.floor(offset / 60)));
  const offsetMinutes = pad(Math.abs(offset % 60));
  const offsetSign = offset >= 0 ? "+" : "-";

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}${offsetSign}${offsetHours}:${offsetMinutes}`;
}
