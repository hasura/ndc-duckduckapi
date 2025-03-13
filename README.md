# Hasura DuckDuckAPI connector

[![Docs](https://img.shields.io/badge/docs-v3.x-brightgreen.svg?style=flat)](https://hasura.io/connectors/duckdb)
[![License](https://img.shields.io/badge/license-Apache--2.0-purple.svg?style=flat)](https://github.com/hasura/ndc-duckdb/blob/main/LICENSE.txt)
[![Status](https://img.shields.io/badge/status-alpha-yellow.svg?style=flat)](https://github.com/hasura/ndc-duckdb/blob/main/README.md)

This DuckDuckAPI connector allows you to easily build a high-performing connector to expose existing API services, where reads happen against DuckDB and writes happen directly to the upstream API servce. This is ideal to make the API data accessible to LLMs via PromptQL,

1. Create a DuckDB schema and write a loading script to load data from an API into DuckDB
2. Implement functions to wrap over upstream API endpoints, particularly for write operations

This allows a GraphQL or PromptQL query to run against API data in a highly flexible way without performance or rate limiting issues.
Ofcourse, the tradeoff is that the data will only be eventually consistent because writes will reflect in subsequent reads only after the API data gets updated in DuckDB (via the loader script).

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

Then update NDC Hub:
- TODO: Action coming soon
   
-------------

## User guide

### How to add this to your DDN project

#### 1. Create a project
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

#### 2. Run jobs via the console and start querying API data from DuckDB!

Head to the OAuth Playground on the console.
1. Login (or add a new oauth2 provider) to your SaaS service
2. Start the loader job by hitting Run

---------------------------
 
### How to build an API integration

1. Set up a `schema.sql`. This will be run on startup and will initialize the duckdb schema. Refer the example in index.ts for details
2. Add loader functions in `functions.ts` and follow the examples to build

To test, run the ts connector and refresh the supergraph project (step 3 onwards in the Get Started above).

----------------------------

### Environment variables

The connector supports the following environment variables:

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

### How to add a custom OAuth2 provider

DDN console has built in OAuth provider templates that can be used by end users to connect to external services.

### Single-tenant support

```typescript
const DATABASE_SCHEMA = "create table if not exists foo( ... )";

const connectorConfig: duckduckapi = {
  dbSchema: DATABASE_SCHEMA,
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
};
```

### Multi-tenant support

```typescript
const connectorConfig: duckduckapi = {
  dbSchema: DATABASE_SCHEMA,
  functionsFilePath: path.resolve(__dirname, "./functions.ts"),
  multitenantMode: true,
  headersArgumentName: "headers",
  getTenantIdFromHeaders: (headers: JSONValue) => string
};
```

The [Zendesk data connector](https://github.com/hasura/zendesk-data-connector) is an example of a multi-tenant data connector.

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

## Functions features

Any functions exported from `functions.ts` are made available as NDC functions/procedures to use in your Hasura metadata and expose as GraphQL fields in queries or mutation.

#### Queries

If you write a function that performs a read-only operation, you should mark it with the `@readonly` JSDoc tag, and it will be exposed as an NDC function, which will ultimately show up as a GraphQL query field in Hasura.

```typescript
/** @readonly */
export function add(x: number, y: number): number {
  return x + y;
}
```

#### Mutations

Functions without the `@readonly` JSDoc tag are exposed as NDC procedures, which will ultimately show up as a GraphQL mutation field in Hasura.

Arguments to the function end up being field arguments in GraphQL and the return value is what the field will return when queried. Every function must return a value; `void`, `null` or `undefined` is not supported.

```typescript
/** @readonly */
export function hello(name: string, year: number): string {
  return `Hello ${name}, welcome to ${year}`;
}
```

#### Async functions

Async functions are supported:

```typescript
type HttpStatusResponse = {
  code: number;
  description: string;
};

export async function test(): Promise<string> {
  const result = await fetch("http://httpstat.us/200");
  const responseBody = (await result.json()) as HttpStatusResponse;
  return responseBody.description;
}
```

#### Multiple functions files

If you'd like to split your functions across multiple files, do so, then simply re-export them from `functions.ts` like so:

```typescript
export * from "./another-file-1";
export * from "./another-file-2";
```

### Supported types

The basic scalar types supported are:

- `string` (NDC scalar type: `String`)
- `number` (NDC scalar type: `Float`)
- `boolean` (NDC scalar type: `Boolean`)
- `bigint` (NDC scalar type: `BigInt`, represented as a string in JSON)
- `Date` (NDC scalar type: `DateTime`, represented as an [ISO formatted](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/toISOString) string in JSON)

You can also import `JSONValue` from the SDK and use it to accept and return arbitrary JSON. Note that the value must be serializable to JSON.

```typescript
import * as sdk from "@hasura/ndc-lambda-sdk";

export function myFunc(json: sdk.JSONValue): sdk.JSONValue {
  const propValue =
    json.value instanceof Object &&
    "prop" in json.value &&
    typeof json.value.prop === "string"
      ? json.value.prop
      : "default value";
  return new sdk.JSONValue({ prop: propValue });
}
```

`null`, `undefined` and optional arguments/properties are supported:

```typescript
export function myFunc(name: string | null, age?: number): string {
  const greeting = name != null ? `hello ${name}` : "hello stranger";
  const ageStatement =
    age !== undefined ? `you are ${age}` : "I don't know your age";

  return `${greeting}, ${ageStatement}`;
}
```

However, any `undefined`s in the return type will be converted to nulls, as GraphQL does not have the concept of `undefined`.

Object types and interfaces are supported. The types of the properties defined on these must be supported types.

```typescript
type FullName = {
  title: string;
  firstName: string;
  surname: string;
};

interface Greeting {
  polite: string;
  casual: string;
}

export function greet(name: FullName): Greeting {
  return {
    polite: `Hello ${name.title} ${name.surname}`,
    casual: `G'day ${name.firstName}`,
  };
}
```

Arrays are also supported, but can only contain a single type (tuple types are not supported):

```typescript
export function sum(nums: number[]): number {
  return nums.reduce((prev, curr) => prev + curr, 0);
}
```

Anonymous types are supported, but will be automatically named after the first place they are used. It is recommended that you **avoid using anonymous types**. Instead, prefer to name all your types to ensure the type name does not change unexpectedly as you rename usage sites and re-order usages of the anonymous type.

```typescript
export function greet(
  name: { firstName: string; surname: string }, // This type will be automatically named greet_name
): string {
  return `Hello ${name.firstName} ${name.surname}`;
}
```

For more docs refer to the underlying [TypeScript Lambda functions connector README](https://github.com/hasura/ndc-nodejs-lambda/blob/main/ndc-lambda-sdk/test/inference/basic-inference/simple-types.ts#functions);
