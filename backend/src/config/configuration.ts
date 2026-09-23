import 'dotenv/config';
import { envSchema } from './env.schema';
export { Configuration } from './env.schema';
export function configuration() { return envSchema.parse(process.env); }
