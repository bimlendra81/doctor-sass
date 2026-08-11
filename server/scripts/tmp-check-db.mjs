import mysql from "mysql2/promise";
const c = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3307,
  user: "root",
  password: "",
  database: "doctor_saas",
});
const [t] = await c.query("SHOW TABLES LIKE 'Drug'");
const [p] = await c.query("SHOW TABLES LIKE 'Prescription%'");
const [m] = await c.query("SELECT migration_name, finished_at, applied_steps_count FROM _prisma_migrations ORDER BY started_at");
console.log("Drug tables:", JSON.stringify(t));
console.log("Prescription tables:", JSON.stringify(p));
console.log("migrations:", JSON.stringify(m));
await c.end();
