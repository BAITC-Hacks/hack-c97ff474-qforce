import { createApp } from './bootstrap';
import { configuration } from './config/configuration';
async function main() { const app = await createApp(); await app.listen(configuration().PORT, '0.0.0.0'); }
main().catch(() => { console.error('Startup failed; check environment, database migrations and bootstrap'); process.exitCode=1; });
