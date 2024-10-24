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
import { JSONValue } from "@hasura/ndc-lambda-sdk";
import { Registry } from "prom-client";

import * as lambdaSdk from "@hasura/ndc-lambda-sdk/connector";

import { CAPABILITIES_RESPONSE, DUCKDB_CONFIG } from "./constants";
import { do_get_schema } from "./handlers/schema";
import { do_explain } from "./handlers/explain";
import { perform_query, plan_queries } from "./handlers/query";
import * as duckdb from "duckdb";
import { generateConfig } from "./generate-config";

const DUCKDB_URL = "duck.db"; // process.env["DUCKDB_URL"] as string || "duck.db";
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

export type Configuration = lambdaSdk.Configuration & {
  duckdbConfig: DuckDBConfigurationSchema;
};

export type State = lambdaSdk.State & {
  client: duckdb.Database;
};

async function createDuckDBFile(schema: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(schema, (err) => {
      if (err) {
        console.error("Error creating schema:", err);
        reject(err);
      } else {
        console.log("Schema created successfully");
        resolve();
      }
    });
  });
}

export interface duckduckapi {
  dbSchema: string;
  functionsFilePath: string;
}

export async function makeConnector(
  dda: duckduckapi,
): Promise<Connector<Configuration, State>> {
  const lambdaSdkConnector = lambdaSdk.createConnector({
    functionsFilePath: dda.functionsFilePath,
  });

  /**
   * Create the db and load the DB path as a global variable
   */
  await createDuckDBFile(dda.dbSchema);

  const connector: Connector<Configuration, State> = {
    /**
     * Validate the configuration files provided by the user, returning a validated 'Configuration',
     * or throwing an 'Error'. Throwing an error prevents Connector startup.
     * @param configuration
     */

    parseConfiguration: async function (
      configurationDir: string,
    ): Promise<Configuration> {
      // Load DuckDB configuration by instrospecting DuckDB
      const duckdbConfig = await generateConfig(db);

      console.log("#####", dda.functionsFilePath);

      const config =
        await lambdaSdkConnector.parseConfiguration(configurationDir);

      return {
        ...config,
        duckdbConfig,
      };
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
    async tryInitState(
      configuration: Configuration,
      metrics: Registry,
    ): Promise<State> {
      const state = await lambdaSdkConnector.tryInitState(
        configuration,
        metrics,
      );
      return Promise.resolve({ ...state, client: db });
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
    getSchema: async function (
      configuration: Configuration,
    ): Promise<SchemaResponse> {
      const schema = await lambdaSdkConnector.getSchema(configuration);
      return do_get_schema(configuration.duckdbConfig, schema);
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
      request: QueryRequest,
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
      request: MutationRequest,
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
    async query(
      configuration: Configuration,
      state: State,
      request: QueryRequest,
    ): Promise<QueryResponse> {
      if (configuration.functionsSchema.functions[request.collection]) {
        return lambdaSdkConnector.query(configuration, state, request);
      } else {
        let query_plans = await plan_queries(configuration, request);
        return await perform_query(state, query_plans);
      }
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
      state: State,
      request: MutationRequest,
    ): Promise<MutationResponse> {
      return lambdaSdkConnector.mutation(configuration, state, request);
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

export function getOAuthCredentialsFromHeader (
  headers: JSONValue
): Record<string, any> {
  const oauthServices = headers.value as any;
  console.log(oauthServices);
  try {
    const decodedServices = Buffer.from(
      oauthServices["x-hasura-oauth-services"] as string,
      "base64",
    ).toString("utf-8");
    const serviceTokens = JSON.parse(decodedServices);
    return serviceTokens;
  } catch (error) {
    console.log(error);
    if (error instanceof Error) {
      console.log(error.stack);
    }
    throw error;
  }
}
