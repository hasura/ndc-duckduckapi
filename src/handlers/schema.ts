import { CollectionInfo, SchemaResponse } from "@hasura/ndc-sdk-typescript";
import { Configuration } from "../duckduckapi";
import { SCALAR_TYPES } from "../constants";

export function do_get_schema(configuration: Configuration): SchemaResponse {
    /** TODO
     * 
    - Get the user to write a duckdb schema file
    - Get the user to write some functions
     * 
     * 
     */
    const {config} = configuration;
    if (!config){
        throw new Error("Configuration is missing");
    }
    const {object_types, collection_names} = config;
    const collection_infos: CollectionInfo[] = [];
    Object.keys(object_types).forEach(cn => {
        if (collection_names.includes(cn)){
            collection_infos.push({
                name: cn,
                arguments: {},
                type: cn,
                uniqueness_constraints: {},
                foreign_keys: {}
            })
        }
    });
    const schema_response: SchemaResponse = {
        scalar_types: SCALAR_TYPES,
        functions: config.functions,
        procedures: config.procedures,
        object_types: config.object_types,
        collections: collection_infos
    }
    return schema_response;
};