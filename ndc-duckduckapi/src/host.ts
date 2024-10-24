// We must initialize OpenTelemetry instrumentation before importing any other module
import * as sdkInstrumentation from "@hasura/ndc-sdk-typescript/instrumentation";
sdkInstrumentation.initTelemetry("ndc-duckduckapi");
import * as path from "path";
import { readFileSync } from "fs";

import * as sdk from "@hasura/ndc-sdk-typescript";
import { makeConnector, duckduckapi } from "./sdk";
import { makeCommand } from "./cmdline";


const program = makeCommand({
  serveAction: async (hostOpts, serveOpts) => {
    const connectorConfig: duckduckapi = {
      dbSchema: readFileSync(hostOpts.schema, "utf-8"),
      functionsFilePath: hostOpts.functions
    };
    const connector = await makeConnector(connectorConfig);

    sdk.startServer(connector, serveOpts);
  },
});

program.parseAsync().catch(err => {
  console.error(err);
  process.exit(1);
});


// From original index.ts
// import { start } from "@hasura/ndc-duckduckapi";
// import { makeConnector, duckduckapi } from "@hasura/ndc-duckduckapi";
// import * as path from "path";
// import { readFileSync } from "fs";

// const calendar: duckduckapi = {
//   dbSchema: readFileSync(path.join(__dirname, "schema.sql"), "utf-8"),
//   functionsFilePath: path.resolve(__dirname, "./functions.ts"),
// };

// (async () => {
//   const connector = await makeConnector(calendar);
//   start(connector);
// })();
