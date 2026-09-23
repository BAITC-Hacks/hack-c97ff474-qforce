import { readdirSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(__dirname, '../../src');
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? files(resolve(directory, entry.name)) : entry.name.endsWith('.ts') ? [resolve(directory, entry.name)] : []);
}
function dependencies(file: string): string[] {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
  const imports: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.arguments.length && (node.expression.kind === ts.SyntaxKind.ImportKeyword || node.expression.getText(source) === 'require') && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return imports;
}

describe('modular monolith dependency rules', () => {
  const sources = files(root);

  it('keeps domain and application independent of frameworks, persistence, DTO and providers', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const filename = relative(root, file).replaceAll('\\', '/');
      if (!/(^|\/)(domain|application)\//.test(filename)) continue;
      for (const dependency of dependencies(file)) {
        const resolved = dependency.startsWith('.') ? resolve(dirname(file), dependency).replaceAll('\\', '/') : dependency;
        if (/^(@nestjs\/|@prisma\/|prisma$|zod$|openai$|@anthropic-ai\/|jsonwebtoken$|axios$)/.test(dependency) || /\/(infrastructure|presentation)\//.test(resolved)) violations.push(`${filename} -> ${dependency}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('crosses business module boundaries only through public contracts or explicit composition exports', () => {
    const violations: string[] = [];
    for (const file of sources) {
      const filename = relative(root, file).replaceAll('\\', '/');
      const current = /^modules\/([^/]+)\//.exec(filename)?.[1];
      if (!current) continue;
      for (const dependency of dependencies(file)) {
        if (!dependency.startsWith('.')) continue;
        const target = relative(root, resolve(dirname(file), dependency)).replaceAll('\\', '/');
        const match = /^modules\/([^/]+)\/(.+)$/.exec(target);
        if (!match || match[1] === current) continue;
        if (match[2] === 'public') continue;
        if (match[2] === 'public-http' && (/\/presentation\//.test(filename) || filename.endsWith('.controller.ts') || filename.endsWith('.module.ts'))) continue;
        if (filename.endsWith('.module.ts') && match[2].endsWith('.module')) continue;
        // Transactional import adapters are composed only in infrastructure/module wiring.
        if (match[2] === 'public-infrastructure' && (/\/infrastructure\//.test(filename) || filename.endsWith('.module.ts'))) continue;
        violations.push(`${filename} -> ${dependency}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('does not expose Prisma in application transaction ports', () => {
    const applicationSources = sources.filter(file => /[\\/]application[\\/]/.test(file));
    const violations = applicationSources.filter(file => /Prisma\.|PrismaClient|TransactionClient/.test(readFileSync(file, 'utf8')));
    expect(violations.map(file => relative(root, file))).toEqual([]);
  });

  it('keeps public application barrels free of framework composition exports', () => {
    const violations: string[] = [];
    for (const file of sources.filter(file => /[\\/]public\.ts$/.test(file))) {
      for (const dependency of dependencies(file)) {
        if (/\/presentation\//.test(dependency) || /\/infrastructure\//.test(dependency) || /\/public-(?:http|infrastructure)$/.test(dependency) || dependency.endsWith('.module')) violations.push(`${relative(root,file)} -> ${dependency}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
