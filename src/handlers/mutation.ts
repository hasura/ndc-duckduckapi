import { MutationOperation, MutationOperationResults, MutationRequest, MutationResponse, Forbidden } from "@hasura/ndc-sdk-typescript";
import { Configuration } from "../duckduckapi";


export async function do_mutation(configuration: Configuration, mutation: MutationRequest): Promise<MutationResponse> {
    throw new Forbidden("Mutations are not supported", {});
}