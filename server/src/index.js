import { app, startGraphQL } from "./app.js";
import { env } from "./config/env.js";
import { initSentry } from "./config/sentry.js";
import { startReminderScheduler } from "./services/reminder.service.js";

async function main() {
  await initSentry();
  await startGraphQL();
  startReminderScheduler(60 * 1000);
  app.listen(env.port, () => {
    console.log(`Server ready at http://localhost:${env.port}`);
    console.log(`GraphQL at http://localhost:${env.port}/graphql`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
