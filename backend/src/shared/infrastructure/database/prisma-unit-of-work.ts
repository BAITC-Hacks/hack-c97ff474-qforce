import { Prisma, PrismaClient } from '@prisma/client';
import { DomainError } from '../../domain/domain-error';
export async function serializable<T>(prisma: PrismaClient, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: 'Serializable', timeout: 15000, maxWait: 2000 }); }
    catch (error) {
      const retryable = error instanceof Prisma.PrismaClientKnownRequestError && (
        ['P2034', 'P2002'].includes(error.code) ||
        (error.code === 'P2010' && ['40001','40P01'].includes(String(error.meta?.code)))
      );
      if (retryable && attempt < 3) continue;
      if (retryable) throw new DomainError('CONCURRENT_UPDATE', 'Please retry the operation', 409);
      throw error;
    }
  }
  throw new DomainError('CONCURRENT_UPDATE', 'Please retry the operation', 409);
}
