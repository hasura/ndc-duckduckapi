import {
  CollectionInfo,
  SchemaResponse,
  ScalarType,
  ObjectType,
} from "@hasura/ndc-sdk-typescript";
import { Configuration } from "../duckduckapi";
import { SCALAR_TYPES } from "../constants";
import { getNdcSchema } from "../lambda-sdk/schema";

export function do_get_schema(configuration: Configuration): SchemaResponse {
  const duckdbconfig = configuration.duckdbConfig;

  if (!duckdbconfig) {
    throw new Error("Configuration is missing");
  }
  const { object_types, collection_names } = duckdbconfig;
  const collection_infos: CollectionInfo[] = [];
  Object.keys(object_types).forEach((cn) => {
    if (collection_names.includes(cn)) {
      collection_infos.push({
        name: cn,
        arguments: {},
        type: cn,
        uniqueness_constraints: {},
        foreign_keys: {},
      });
    }
  });

  // Now lets get the Function Schema
  const functionsNDCSchema = getNdcSchema(configuration.functionsSchema);

  // Let's merge the scalar types from DuckDB and TS Lambda
  const mergedScalarTypes: { [key: string]: ScalarType } = { ...SCALAR_TYPES };

  for (const [key, value] of Object.entries(functionsNDCSchema.scalar_types)) {
    if (key in mergedScalarTypes) {
      console.log(`Overlapping key found: ${key}`);
    }
    mergedScalarTypes[key] = value;
  }

  // Let's merge the object types from DuckDB and TS Lambda
  const mergedObjectTypes: { [key: string]: ObjectType } = {
    ...duckdbconfig.object_types,
  };

  for (const [key, value] of Object.entries(functionsNDCSchema.object_types)) {
    if (key in mergedObjectTypes) {
      console.log(`Overlapping key found: ${key}`);
    }
    mergedObjectTypes[key] = value;
  }

  const schema_response: SchemaResponse = {
    scalar_types: mergedScalarTypes,
    functions: functionsNDCSchema.functions,
    procedures: functionsNDCSchema.procedures,
    object_types: mergedObjectTypes,
    collections: collection_infos,
  };
  return schema_response;
}
