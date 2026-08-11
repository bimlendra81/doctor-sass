import { app, startGraphQL } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./config/sentry.js";

async function main() {
  await initSentry();
  await startGraphQL();
  app.listen(env.port, () => {
    console.log(`Server ready at http://localhost:${env.port}`);
    console.log(`GraphQL at http://localhost:${env.port}/graphql`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
