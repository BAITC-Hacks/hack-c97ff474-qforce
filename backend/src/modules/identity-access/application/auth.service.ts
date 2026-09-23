import { Actor } from '../domain/actor';
import { DomainError } from '../../../shared/domain/domain-error';
export interface AuthUser extends Actor { username: string; passwordHash: string; }
export interface UserRepository { byUsername(username: string): Promise<AuthUser | null>; byId(id: string): Promise<AuthUser | null>; }
export interface CredentialPort { verify(password: string, hash: string): Promise<boolean>; sign(actor: Actor): string; }
export class AuthService {
  constructor(private readonly users: UserRepository, private readonly credentials: CredentialPort) {}
  async login(username: string, password: string) {
    const user = await this.users.byUsername(username);
    const valid = await this.credentials.verify(password, user?.passwordHash ?? '');
    if (!user || !valid) throw new DomainError('INVALID_CREDENTIALS', 'Invalid username or password', 401);
    const actor = { id: user.id, role: user.role, employeeId: user.employeeId };
    return { accessToken: this.credentials.sign(actor), tokenType: 'Bearer', user: actor };
  }
  async me(id: string) {
    const user = await this.users.byId(id);
    if (!user) throw new DomainError('UNAUTHORIZED', 'Account no longer exists', 401);
    return { id: user.id, username: user.username, role: user.role, employeeId: user.employeeId };
  }
}
