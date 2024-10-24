CREATE TABLE IF NOT EXISTS calendar_events (
  id VARCHAR PRIMARY KEY,
  summary VARCHAR,
  description VARCHAR,
  start_time TIMESTAMP,  -- Will store both date-only and datetime values
  end_time TIMESTAMP,    -- Will store both date-only and datetime values
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
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
  original_start_time TIMESTAMP,
  extended_properties JSON,
  attachments JSON,
  html_link VARCHAR,
  meeting_type VARCHAR,
  sequence INTEGER,
  event_type VARCHAR,
  calendar_id VARCHAR,
  sync_status VARCHAR,
  last_synced TIMESTAMP,
  is_all_day BOOLEAN   -- New field to distinguish all-day events
);

CREATE TABLE IF NOT EXISTS sync_state (
  calendar_id VARCHAR PRIMARY KEY,
  sync_token VARCHAR,
  last_sync TIMESTAMP
);
