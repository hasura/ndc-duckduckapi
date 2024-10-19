export const duckdbschema : string = `

CREATE TABLE IF NOT EXISTS users (
    id int,
    name string
);

CREATE TABLE IF NOT EXISTS articles (
    id int,
    title string,
    author_id int
);

`;