// Writes schema/*.schema.json from src/schema.js.  npm run schemas
import { writeFileSync, mkdirSync } from 'node:fs';
import { buildSchemas } from '../src/schema.js';

const dir = new URL('../schema/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
for (const [name, schema] of Object.entries(buildSchemas())) {
  writeFileSync(dir + name, `${JSON.stringify(schema, null, 2)}\n`);
  console.log(dir + name);
}
