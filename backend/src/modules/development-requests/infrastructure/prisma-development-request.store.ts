import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/infrastructure/database/prisma.service';
import { DomainError } from '../../../shared/domain/domain-error';
import { DevelopmentRequestStore } from '../application/development-requests.service';

export class PrismaDevelopmentRequestStore implements DevelopmentRequestStore {
  constructor(private readonly db: PrismaService) {}
  get(employeeId: string) { return this.db.developmentRequest.findUnique({where: {employeeId}}); }
  async open(employeeId: string, snapshot: unknown, expectedVersion: number | null) {
    if (expectedVersion === null) {
      const record = await this.db.developmentRequest.upsert({where: {employeeId},
        create: {employeeId, snapshot: snapshot as Prisma.InputJsonValue}, update: {}});
      if (record.status !== 'OPEN') throw new DomainError('REQUEST_CHANGED', 'The request has been answered. Refresh before explicitly reopening it.', 409);
      return record;
    }
    const record = await this.get(employeeId);
    if (record?.status === 'OPEN' && [expectedVersion, expectedVersion + 1].includes(record.version)) return record;
    const changed = await this.db.developmentRequest.updateMany({where: {employeeId, status: 'RESOLVED', version: expectedVersion},
      data: {status: 'OPEN', snapshot: snapshot as Prisma.InputJsonValue, version: {increment: 1}}});
    if (!changed.count) throw new DomainError('REQUEST_CHANGED', 'The request changed. Refresh before reopening it.', 409);
    return (await this.get(employeeId))!;
  }
  async list(status: 'OPEN' | 'RESOLVED', page: number, pageSize: number) {
    const [total, data] = await this.db.$transaction([
      this.db.developmentRequest.count({where: {status}}),
      this.db.developmentRequest.findMany({where: {status}, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{updatedAt: 'asc'}, {id: 'asc'}], include: {employee: {select: {fullName: true, roleId: true, gradeId: true}}}}),
    ]);
    return {data, meta: {total, page, pageSize}};
  }
  async resolve(id: string, actorId: string, resolution: string, expectedVersion: number) {
    const record = await this.db.developmentRequest.findUnique({where: {id}});
    if (!record) throw new DomainError('NOT_FOUND', 'Development request not found', 404);
    const changed = await this.db.developmentRequest.updateMany({where: {id, status: 'OPEN', version: expectedVersion},
      data: {status: 'RESOLVED', resolution, resolvedAt: new Date(), resolvedBy: actorId, version: {increment: 1}}});
    if (!changed.count) throw new DomainError('REQUEST_CHANGED', 'The request changed. Refresh before answering it.', 409);
    return (await this.db.developmentRequest.findUnique({where: {id}}))!;
  }
}
