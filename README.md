# Hasura DuckDuckAPI connector

[![License](https://img.shields.io/badge/license-Apache--2.0-purple.svg?style=flat)](https://github.com/hasura/ndc-duckdb/blob/main/LICENSE.txt)
[![Status](https://img.shields.io/badge/status-alpha-yellow.svg?style=flat)](https://github.com/hasura/ndc-duckdb/blob/main/README.md)

The DuckDuckAPI connector allows you to easily build a high-performing connector to expose existing API services, where reads happen against DuckDB and writes happen directly to the upstream API servce. This is ideal to make the API data accessible to LLMs via PromptQL,

1. Create a DuckDB schema and write a loading script to load data from an API into DuckDB
2. Implement functions to wrap over upstream API endpoints, particularly for write operations

This allows a GraphQL or PromptQL query to run against API data in a highly flexible way without performance or rate limiting issues.
Of course, the tradeoff is that the data will only be eventually consistent because writes will reflect in subsequent reads only after the API data gets updated in DuckDB (via the loader script).

The DuckDuckAPI connector is also able to advertise endpoints for running job statuses, and OAuth configuration and login flows. These integrate with the DDN Console, or can be integrated into custom solutions using the API.

- [Hasura DuckDuckAPI connector](#hasura-duckduckapi-connector)
  - [Developer guide](#developer-guide)
    - [How to add this to your DDN project](#how-to-add-this-to-your-ddn-project)
      - [1. Creating a project and the developer workflow](#1-creating-a-project-and-the-developer-workflow)
      - [2. DDN console integration](#2-ddn-console-integration)
    - [Building with the connector](#building-with-the-connector)
    - [Single-tenant and multi-tenant](#single-tenant-and-multi-tenant)
    - [Initialising the connector](#initialising-the-connector)
    - [Functions features](#functions-features)
    - [Configuring OAuth workflows](#configuring-oauth-workflows)
    - [Examples](#examples)
    - [Environment variables](#environment-variables)
  - [Duck DB Features](#duck-db-features)
  - [Contributing](#contributing)
    - [Development](#development)
    - [Publishing](#publishing)


---

## Developer guide

### How to add this to your DDN project

#### 1. Creating a project and the developer workflow
```
ddn supergraph init myproject
ddn connector init -i
>>> choose hasura/duckduckapi
>>> set name to myconnector
ddn connector introspect myconnector
ddn models add myconnector '*'
ddn commands add myconnector '*'

# For local dev
ddn supergraph build local
ddn run docker-start
ddn console --local

# For deploying to cloud
ddn supergraph build create
ddn console
```

#### 2. DDN console integration

If you have set up your connector to advertise job statuses or OAuth configuration, they will show up on the SaaS integrations tab on the console.

---
 
### Building with the connector

1. Initialize the connector in either single tenant or multi tenant mode in `index.ts`
2. Add loader functions in `functions.ts` and follow the examples to build

To test, run the ts connector and refresh the supergraph project (by introspecting, adding the models and commands, and updating the supergraph build).

See the examples section for code examples of what it looks like.

### Single-tenant and multi-tenant

In single-tenant mode, there is only one DuckDB database.

In multi-tenant mode, every end user (i.e. the user of application) has isolated and independent data. Every end user has their own instance of DuckDB database. The connector routes all queries made by the user to their own DuckDB database.

The tenant here is the end user (user of your application API or PromptQL application).

### Initialising the connector

In `index.ts`

```typescript
const DATABASE_SCHEMA = "create table if not exists foo( ... )";

// single-tenant mode
const connectorConfig: duckduckapi = {
  dbSchema: DATABASE_SCHEMA,
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
};

// or multi-tenant mode
const connectorConfig: duckduckapi = {
  dbSchema: DATABASE_SCHEMA,
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
  multitenantMode: true,
  headersArgumentName: "headers",
  getTenantIdFromHeaders: (headers: JSONValue) => string
};
```

In multi-tenant mode, the user is identified by the following steps:
- The engine forwards the known end user id to the connector via header forwarding (keywords: DataConnectorLink > argumentPresets > httpHeaders)
- The connector initialisation is passed the headersArgumentName and getTenantIdFromHeaders function which is used to determine the user id as a string value
- The connector looks up the user specific database based on the user id
- Any queries are executed against the user specific database

Further, the PromptQL Playground enables this workflow in the following manner
- The PromptQL Playground on the DDN Console sets a signed JWT key with the known logged in user id
- The engine decoded this verified user id from the JWT key

See the examples section for code examples on what this looks like.

The [Zendesk data connector](https://github.com/hasura/zendesk-data-connector) is an example of a multi-tenant data connector.

### Functions features

This connector uses the Node.js Lambda Connector to expose TypeScript functions as NDC functions/procedures for use in your Hasura DDN subgraphs.

Functions must be exported from `functions.ts`.

Functions can access the DuckDB databases.

```typescript
export async function getLastName(firstName: string, headers: JSONValue) {
  // In single-tenant mode
  const db = await getDb();

  // Or multi-tenant mode
  const tenantId = getTenantIdFromHeaders(headers); // see examples for an example implementation
  const db = await getTenantDb(tenantId);

  // db is a DuckDB database object, do DuckDB things with it
  const rows = db.all('SELECT lastName FROM users WHERE firstName = ?', firstName);
  // ... do something with returned rows
}
```

For more details about creating Queries and Mutations, and throwing custom errors that show up in your API, see the [Node.js Lambda Connector Documentation](https://github.com/hasura/ndc-nodejs-lambda?tab=readme-ov-file#functions).

### Configuring OAuth workflows

DDN Console has built in OAuth provider templates that can be used by end users to connect to external services.

DDN Console handles getting the OAuth code, then passes the code to the connector. The connector implements token exchange.

The connector advertises that it supports OAuth login workflows by implmenting typescript functions with certain function tags.

A function tag is a string with a special format such as `$ddn.config` or `$ddn.functions.*`. By making the function tag a substring of the metadata description for the function, it becomes available in the introspectable API documentation, and the console will use it to configure user facing components for the OAuth workflows.

See the type `DDNConnectorEndpointsConfigV1` in the example code for details.

A job is a long running process, for instance a loop used to sync a user's information with an external API. A job can return a status message to the end user via the console by implementing a TypeScript function which is polled at regular intervals.

`oauthProviders` define the OAuth login flows that the connector can accept. The `template` is an enumerated value of strings that the DDN console currently supports.

### Examples

Single-tenant example: [Run PromptQL on your GitHub data](https://github.com/hasura/example-promptql-github/tree/main) [Tutorial](https://hasura.io/docs/promptql/recipes/tutorials/github-assistant/)
- Initialise the connector [index.ts](https://github.com/hasura/example-promptql-github/blob/main/app/connector/github/index.ts)
- Implementation of sync code, this technically did not need to be in functions.ts, member functions of classes are not exported to the API [functions.ts](https://github.com/hasura/example-promptql-github/blob/main/app/connector/github/functions.ts)

Multi-tenant exmaple: [Zendesk data connector](https://github.com/hasura/zendesk-data-connector)
- Working: we maintain a map of tenantId to a SyncManager class that runs the sync job for each end user.
- Initialise the connector in multi-tenant mode [index.ts](https://github.com/hasura/zendesk-data-connector/blob/master/app/connector/myduckduckapi/index.ts)
- Creates API functions to show the sync status, and support OAuth login workflow with the external Zendesk service; uses function tags to integrate with the DDN console [functions.ts](https://github.com/hasura/zendesk-data-connector/blob/master/app/connector/myduckduckapi/functions.ts)
- How to get the tenantId from headers forwarded to the connector, and how to exchange the OAuth code for a token [lib.ts](https://github.com/hasura/zendesk-data-connector/blob/master/app/connector/myduckduckapi/lib/lib.ts)
- How to build a robust SyncManager, that updates the status message, handles retries and errors [TenantManager.ts](https://github.com/hasura/zendesk-data-connector/blob/master/app/connector/myduckduckapi/lib/TenantManager.ts)
- Engine configuration
  - Configuring the engine to forward user details to the connector, see argumentPresets at the end of the file [myduckduckapi.hml](https://github.com/hasura/zendesk-data-connector/blob/master/app/metadata/myduckduckapi.hml)
  - The engine extracts verified user id from JWT token [auth-config.hml](https://github.com/hasura/zendesk-data-connector/blob/master/globals/metadata/auth-config.hml)
  - JWT public key to decode the key sent by the PromptQL Playground and DDN Console, see JWT_PUBLIC_KEY [.env.development](https://github.com/hasura/zendesk-data-connector/blob/master/.env.development)

### Environment variables

The connector supports the following environment variables. They all have usable default values.

- `DUCKDB_PATH`: Path inside the docker container to store DuckDB database.
  - On DDN, set this to inside the /etc/connector/persist-data directory to persist data on connector restarts.
  - DDN scaffolded value: `/etc/connector/persist-data/db`
  - Default value: `./persist-data/db`
- `DUCKDB_URL`: Optional. File name of the default DuckDB database. Relative to the DUCKDB_PATH.
  - Default value: `./duck.db`
- `NODE_OPTIONS`: Optional. Node options for the connector.
  - Default value: `--max-old-space-size=4096`

DDN recognizes the following additional environment variables:

- `FEATURE_PERSISTENT_DATA`: Optional. Whether to persist data in the connector deployment.
  - DDN scaffolded value: `true`
- `FEATURE_MIN_INSTANCES`: Optional. Minimum number of instances to keep running (set to 1 to keep one instance running at all times).
  - DDN scaffolded value: `1`

---

## Duck DB Features

Below, you'll find a matrix of all supported features for the DuckDB connector:

| Feature                         | Supported | Notes |
| ------------------------------- | --------- | ----- |
| Native Queries + Logical Models | ❌        |       |
| Simple Object Query             | ✅        |       |
| Filter / Search                 | ✅        |       |
| Simple Aggregation              | ❌        |       |
| Sort                            | ✅        |       |
| Paginate                        | ✅        |       |
| Table Relationships             | ✅        |       |
| Views                           | ❌        |       |
| Distinct                        | ❌        |       |
| Remote Relationships            | ✅        |       |
| Custom Fields                   | ❌        |       |
| Mutations                       | ❌        |       |

---

## Contributing

This repo is both a connector and an npm SDK. This makes the dev lifecycle a little interesting to set up. 

### Development
1. Clone this repo
2. `cd ndc-duckduckapi`
3. `npm i`
4. `npm run build`
5. From the root folder of this project: `cd connector-definition/template`
6. Make sure your package.json is using the `ndc-duckduckapi` sdk through a file URI for local dev:
   ```
   ....
    "@hasura/ndc-duckduckapi": "file:///../../ndc-duckduckapi"
   ...
   ````
7. Now run: `npm install`
8. And now, run the connector: `HASURA_CONNECTOR_PORT=9094 npm run start`
9. Verify that everything is running by hitting `localhost:9094/schema` and you should see a google-calendar NDC schema

To test this connector, you'll want to run a supergraph project that uses this connector as an HTTP connector:
1. Outside of this repo, `ddn supergraph init test-proj`
2. `ddn connector-link add dda --configure-host=http://local.hasura.dev:9094`
3. Make sure to remove the Authorization headers from the `dda.hml`
4. Make sure to add argumentPresets to dda.hml
 ```argumentPresets:
      - argument: headers
        value:
          httpHeaders:
            forward:
              - X-Hasura-Oauth-Services
            additional: {}
```  
5. `ddn connector-link update dda`
6. `ddn connector-link add-resources dda`
7. `ddn supergraph build local`
8. `ddn run docker-start`

### Publishing

1. Submit a PR and once its merged to main, tag it with a version and everything else is magic
2. `git tag v0.1.6`

Then update NDC Hub to create a release.