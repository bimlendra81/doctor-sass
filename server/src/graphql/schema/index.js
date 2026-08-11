import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadFilesSync } from "@graphql-tools/load-files";
import { mergeTypeDefs } from "@graphql-tools/merge";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const typeDefs = loadFilesSync(path.join(__dirname, "./**/*.graphql"));

export const typeDefsSource = mergeTypeDefs(typeDefs);
