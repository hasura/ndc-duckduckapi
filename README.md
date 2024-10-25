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

1. Clone this repo
2. Setup: `npm i`
3. Run: `NODE_OPTIONS="--max-old-space-size=4096" HASURA_SERVICE_TOKEN_SECRET=secrettoken HASURA_CONNECTOR_PORT=9094 npx ts-node ./src/index.ts serve --configuration=.`
4. Remove `duck.db` and `duck.db.wal` from `.gitignore` if you'd like
5. Create a new DDN project with this running as a custom HTTP connector to test

```bash
ddn supergraph init new-project
ddn connector-link add myapi --configure-host http://local.hasura.dev:9094 --configure-connector-token secrettoken
cat <<EOF >> app/metadata/myapi.hml
  argumentPresets:
    - argument: headers
      value:
        httpHeaders:
          forward:
            - "*"
          additional: {}
EOF
ddn connector-link update myapi
ddn models add myapi '*'
ddn commands add myapi '*'
ddn supergraph build local
ddn run docker-start
ddn console --local
```

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

### How to add a custom OAuth2 provider

_TODO:_

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
