import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { AuthUser, UserRepository } from '../application/auth.service';
export class PrismaUsers implements UserRepository {
  constructor(private readonly prisma: PrismaService) {}
  private map(user: { id: string; username: string; role: string; employeeId: string | null; passwordHash: string } | null): AuthUser | null {
    return user && (user.role === 'HR' || user.role === 'EMPLOYEE') ? { ...user, role: user.role } : null;
  }
  async byUsername(username: string) { return this.map(await this.prisma.user.findUnique({ where: { username } })); }
  async byId(id: string) { return this.map(await this.prisma.user.findUnique({ where: { id } })); }
}
