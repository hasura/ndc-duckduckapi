import { RowSet } from "@hasura/ndc-sdk-typescript";

export function helloWorld(): RowSet[]{
    return [{rows: [{"__value": "Hello world"}]}];
};

export const functions: Record<string, any> = {
    "Hello": helloWorld
};