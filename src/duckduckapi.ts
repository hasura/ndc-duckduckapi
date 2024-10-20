import {
    SchemaResponse,
    ObjectType,
    FunctionInfo,
    ProcedureInfo,
    QueryRequest,
    QueryResponse,
    MutationRequest,
    MutationResponse,
    Capabilities,
    ExplainResponse,
    Connector,
    Forbidden,
} from "@hasura/ndc-sdk-typescript";

import path from "node:path"
import { FunctionsSchema, getNdcSchema, printRelaxedTypesWarning } from "./lambda-sdk/schema";
import { deriveSchema, printCompilerDiagnostics, printFunctionIssues } from "./lambda-sdk/inference";
import { RuntimeFunctions, executeMutation, executeQuery } from "./lambda-sdk/execution";

import { CAPABILITIES_RESPONSE, DUCKDB_CONFIG } from "./constants";
import { do_get_schema } from "./handlers/schema";
import { do_explain } from "./handlers/explain";
import { do_query } from "./handlers/query";
import { do_mutation } from "./handlers/mutation";
import { readFileSync } from "fs";
import * as duckdb from "duckdb";
import { generateConfig } from "../generate-config";

const DUCKDB_URL =  'duck.db'; // process.env["DUCKDB_URL"] as string || "duck.db";
export const db = new duckdb.Database(DUCKDB_URL);

export type DuckDBConfigurationSchema = {
  collection_names: string[];
  collection_aliases: { [k: string]: string };
  object_types: { [k: string]: ObjectType };
  functions: FunctionInfo[];
  procedures: ProcedureInfo[];
};

type CredentialSchema = {
  url: string;
};

export type Configuration = {
  duckdbConfig: DuckDBConfigurationSchema
  functionsSchema: FunctionsSchema
  runtimeFunctions: RuntimeFunctions
};

export interface State {
  client: duckdb.Database;
}

async function createDuckDBFile(schema: string): Promise<void> {
  return new Promise((resolve, reject) => {
    
    db.run(schema, (err) => {
      if (err) {
        console.error('Error creating schema:', err);
        reject(err);
      } else {
        console.log('Schema created successfully');
        resolve();
      }
    });

  });
}

export interface duckduckapi {
  dbSchema: string
  loaderJob(db: duckdb.Database): void
  functionsFilePath: string
}

export async function makeConnector(dda: duckduckapi): Promise<Connector<Configuration, State>> {
  
  /*
   TODO: create the db and load the DB path as a global variable
   Create the configuration object
  */
  await createDuckDBFile(dda.dbSchema);

  // spawn loaderjob execution on a cron
  dda.loaderJob(db);

  const connector: Connector<Configuration, State> = {
    /**
     * Validate the configuration files provided by the user, returning a validated 'Configuration',
     * or throwing an 'Error'. Throwing an error prevents Connector startup.
     * @param configuration
     */

    parseConfiguration: async function (configurationDir: string): Promise<Configuration> {
      // Load DuckDB configuration
      const duckdbConfig = await generateConfig(db);

      // Load functions configuration
      // We need to try imporing the functions code via require before doing schema inference because
      // during watch mode we need it to be registered in the watching system so when the files are
      // changed we reload. If the files fail to compile, ts-node will print the diagnostic errors on the
      // terminal for us
      let runtimeFunctions: RuntimeFunctions | undefined = undefined;
      try {
        runtimeFunctions = require(dda.functionsFilePath);
      } catch (e) {
        console.error(`${e}`); // Print the compiler errors produced by ts-node
        runtimeFunctions = undefined;
      }

      // If the functions successfully loaded (ie. compiled), let's derive the schema.
      // Unfortunately this means we've typechecked everything twice, but that seems unavoidable without
      // implementing our own hot-reloading system instead of using ts-node-dev.
      if (runtimeFunctions !== undefined) {
        const schemaResults = deriveSchema(require.resolve(dda.functionsFilePath));
        printCompilerDiagnostics(schemaResults.compilerDiagnostics); // Should never have any of these, since we've already tried compiling the code above
        printFunctionIssues(schemaResults.functionIssues);
        printRelaxedTypesWarning(schemaResults.functionsSchema);

        const config : Configuration = {
          duckdbConfig,
          functionsSchema: schemaResults.functionsSchema,
          runtimeFunctions,
        }
        console.log(config);
        return config;
      }
      // If the functions did not compile, just have an empty schema, the user will need to correct
      // their code before we can derive a schema
      else {
        console.error("Couldn't generate functions schema");
        return {
          duckdbConfig,
          functionsSchema: {
            functions: {},
            objectTypes: {},
            scalarTypes: {},
          },
          runtimeFunctions: {}
        }
      }
    },

    /**
     * Initialize the connector's in-memory state.
     *
     * For example, any connection pools, prepared queries,
     * or other managed resources would be allocated here.
     *
     * In addition, this function should register any
     * connector-specific metrics with the metrics registry.
     * @param configuration
     * @param metrics
     */
    tryInitState(_: Configuration, __: unknown): Promise<State> {
      // const credentials: CredentialSchema = { url: DUCKDB_URL };
      // const client = new duckdb.Database(credentials.url, DUCKDB_CONFIG);
      const client = db;
      return Promise.resolve({ client: client });
    },

    /**
     * Get the connector's capabilities.
     *
     * This function implements the [capabilities endpoint](https://hasura.github.io/ndc-spec/specification/capabilities.html)
     * from the NDC specification.
     * @param configuration
     */
    getCapabilities(_: Configuration): Capabilities {
      return CAPABILITIES_RESPONSE;
    },

    /**
     * Get the connector's schema.
     *
     * This function implements the [schema endpoint](https://hasura.github.io/ndc-spec/specification/schema/index.html)
     * from the NDC specification.
     * @param configuration
     */
    getSchema: async function (configuration: Configuration): Promise<SchemaResponse> {
      return Promise.resolve(do_get_schema(configuration));
    },

    /**
     * Explain a query by creating an execution plan
     *
     * This function implements the [explain endpoint](https://hasura.github.io/ndc-spec/specification/explain.html)
     * from the NDC specification.
     * @param configuration
     * @param state
     * @param request
     */
    queryExplain(
      configuration: Configuration,
      _: State,
      request: QueryRequest
    ): Promise<ExplainResponse> {
      return do_explain(configuration, request);
    },

    /**
     * Explain a mutation by creating an execution plan
     * @param configuration
     * @param state
     * @param request
     */
    mutationExplain(
      configuration: Configuration,
      _: State,
      request: MutationRequest
    ): Promise<ExplainResponse> {
      throw new Forbidden("Not implemented", {});
    },

    /**
     * Execute a query
     *
     * This function implements the [query endpoint](https://hasura.github.io/ndc-spec/specification/queries/index.html)
     * from the NDC specification.
     * @param configuration
     * @param state
     * @param request
     */
    query(
      configuration: Configuration,
      state: State,
      request: QueryRequest
    ): Promise<QueryResponse> {
      return do_query(configuration, state, request);
    },

    /**
     * Execute a mutation
     *
     * This function implements the [mutation endpoint](https://hasura.github.io/ndc-spec/specification/mutations/index.html)
     * from the NDC specification.
     * @param configuration
     * @param state
     * @param request
     */
    mutation(
      configuration: Configuration,
      _: State,
      request: MutationRequest
    ): Promise<MutationResponse> {
      return do_mutation(configuration, request);
    },

    /**
     * Check the health of the connector.
     *
     * For example, this function should check that the connector
     * is able to reach its data source over the network.
     * @param configuration
     * @param state
     */
    getHealthReadiness(_: Configuration, __: State): Promise<undefined> {
      return Promise.resolve(undefined);
    },

    /**
     *
     * Update any metrics from the state
     *
     * Note: some metrics can be updated directly, and do not
     * need to be updated here. This function can be useful to
     * query metrics which cannot be updated directly, e.g.
     * the number of idle connections in a connection pool
     * can be polled but not updated directly.
     * @param configuration
     * @param state
     */
    fetchMetrics(_: Configuration, __: State): Promise<undefined> {
      return Promise.resolve(undefined);
    },
  };

  return Promise.resolve(connector);
}