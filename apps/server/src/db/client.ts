import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema.js";

// One pool + drizzle instance for the whole process.
const pool = new Pool({ connectionString: env.DATABASE_URL });

export const db = drizzle(pool, { schema });
export { schema };
