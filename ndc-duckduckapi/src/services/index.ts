export const GoogleCalendar = {
    SyncManager: require("./google-calendar").SyncManager,
    Schema: require("./google-calendar").Schema,
    CreateCalendarEvent: require("./google-calendar").createCalendarEvent
}

export const GMail = {
    SyncManager: require("./gmail").SyncManager,
    Schema: require("./gmail").Schema
}
