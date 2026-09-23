import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { Configuration } from '../../../config/configuration';
import { Actor } from '../domain/actor';
import { CredentialPort } from '../application/auth.service';
const scrypt = promisify(scryptCallback);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export class Credentials implements CredentialPort {
  constructor(private readonly config: Configuration) {}
  async verify(password: string, hash: string) {
    const [algorithm, salt, encoded] = hash.split(':');
    const expected = Buffer.from(encoded ?? '00'.repeat(64), 'hex');
    const actual = await scrypt(password, salt ?? 'absent-user-timing-salt', 64) as Buffer;
    return algorithm === 'scrypt' && expected.length === actual.length && timingSafeEqual(actual, expected);
  }
  sign(actor: Actor) {
    return jwt.sign({ role: actor.role, employeeId: actor.employeeId }, this.config.JWT_SECRET, {
      subject: actor.id, expiresIn: this.config.JWT_TTL_SECONDS, algorithm: 'HS256', issuer: 'career-quest', audience: 'career-quest-api',
    });
  }
}
