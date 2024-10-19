/*

1. Write the DuckDB schema
2. Write the functions

npm start connector

<ddn takes over>
*/


/*
index.ts:
- ndc.start(connector)
- connector:
    - parseConfiguration
    - tryInitState:
        - duckduckapi.createdb()
        - duckduckapi.loadjob()
    - getCapabilities:
        - duckdb capabilities
    - getSchema
        - get the duckdb schema
        - get functions from duckduckapi.getfunctions()
    - queryExplain
        - duckdb implementation
        - if my function, then say function call
    - mutationExplain
        - if my function, then say function call
    - query
        - use duckdb queryplanning
        - if my function, then run my function
        - duckduckapi.runfunction(functionName: string, args: {})
    - mutation
        - if my function, then run my function
    - getHealthReadiness: NA
    - fetchMetrics: NA
*/


/* Building a connector
    index.ts:
    - import ndc-sdk;
    - import makeConnector, duckduckapi from duckduckapi-sdk;
    - const calendar : duckduckapi = {
        createdb()
        loadjob()
        getfunctions()
    };
    - start(makeConnector(calendar));
*/

/* Someone publishes this calendar connector
    -  export calendar : duckduckapi = ...;
    -  npm publish calendar
*/

/* Someone wants to use my calendar
    - import calendar from tristen/calendar;
    - const calendar: duckduckapi = calendar;
    - start(calendar)
*/