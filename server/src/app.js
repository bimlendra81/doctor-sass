import cors from "cors";
import express from "express";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { typeDefsSource } from "./graphql/schema/index.js";
import { resolvers } from "./graphql/resolvers/index.js";
import { buildContext } from "./graphql/context.js";
import { authDirectiveTransformer } from "./graphql/directives/auth.js";
import { authMiddleware } from "./middlewares/auth.js";
import { errorHandler } from "./middlewares/error.js";
import { AppError } from "./utils/errors.js";

let schema = makeExecutableSchema({ typeDefs: typeDefsSource, resolvers });
schema = authDirectiveTransformer(schema);

export const app = express();

app.use(cors());
app.use(express.json());
app.use(authMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const graphqlServer = new ApolloServer({
  schema,
  formatError: (formatted, error) => {
    const original = error?.originalError ?? error;
    if (original instanceof AppError) {
      return {
        message: original.message,
        extensions: {
          code: original.code,
          ...(original.details ? { details: original.details } : {}),
        },
      };
    }
    return formatted;
  },
});

export async function startGraphQL() {
  await graphqlServer.start();
  app.use(
    "/graphql",
    expressMiddleware(graphqlServer, {
      context: async ({ req }) => buildContext({ user: req.user ?? null, req }),
    }),
  );
  app.use(errorHandler);
}
