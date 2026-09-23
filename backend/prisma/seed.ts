import { PrismaService } from '../src/shared/infrastructure/database/prisma.service';
import { configuration, Configuration } from '../src/config/configuration';
import { hashPassword } from '../src/modules/identity-access/infrastructure/credentials';
export async function seed(prisma: PrismaService, config: Configuration) {
  if (!config.DEMO_MODE || config.NODE_ENV === 'production') return { created: 0, reason: 'Demo accounts disabled' };
  const employee = config.DEMO_EMPLOYEE_ID
    ? await prisma.employee.findUnique({ where: { id: config.DEMO_EMPLOYEE_ID } })
    : await prisma.employee.findFirst({ orderBy: { id: 'asc' } });
  if (!employee) throw new Error('Import employees before seeding; configured DEMO_EMPLOYEE_ID must exist');
  let created = 0;
  for (const account of [
    { username: config.DEMO_HR_USERNAME, password: config.DEMO_HR_PASSWORD!, role: 'HR', employeeId: null },
    { username: config.DEMO_EMPLOYEE_USERNAME, password: config.DEMO_EMPLOYEE_PASSWORD!, role: 'EMPLOYEE', employeeId: employee.id },
  ]) {
    if (await prisma.user.findUnique({ where: { username: account.username } })) continue;
    await prisma.user.create({ data: { username: account.username, passwordHash: await hashPassword(account.password), role: account.role, employeeId: account.employeeId } }); created++;
  }
  return { created, employeeId: employee.id };
}
if (require.main === module) {
  const prisma = new PrismaService();
  seed(prisma, configuration()).then(result => console.log(JSON.stringify(result))).catch(() => { console.error('Seed failed: check database, imported employees and demo configuration'); process.exitCode = 1; }).finally(() => prisma.$disconnect());
}
