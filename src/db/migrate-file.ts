import {sql} from './client.js';
console.error('Individual migration replay is disabled in v0.36. Use npm.cmd run db:migrate; for an existing untracked database back it up and use db:adopt first.');
process.exitCode=1;
await sql.end();
