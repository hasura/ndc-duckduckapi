import {
  MutationOperation,
  MutationOperationResults,
  MutationRequest,
  MutationResponse,
  Forbidden,
} from "@hasura/ndc-sdk-typescript";
import { Configuration } from "../duckduckapi";
import { executeMutation } from "../lambda-sdk/execution";

export async function do_mutation(
  configuration: Configuration,
  mutation: MutationRequest,
): Promise<MutationResponse> {
  return await executeMutation(
    mutation,
    configuration.functionsSchema,
    configuration.runtimeFunctions,
  );
}
