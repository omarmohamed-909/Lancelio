import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import test from 'node:test';
import ts from 'typescript';

const sourceRoot = fileURLToPath(new URL('../apps/api/src/', import.meta.url));
const allowedLayers = {
  domain: new Set(['domain']),
  application: new Set(['domain', 'application']),
  infrastructure: new Set(['domain', 'application', 'infrastructure']),
  presentation: new Set(['domain', 'application', 'presentation']),
};

function location(file) {
  const parts = file.replaceAll('\\', '/').split('/');
  const layer = parts.find((part) => part in allowedLayers);
  const moduleIndex = parts.indexOf('modules');
  return {
    layer,
    module: moduleIndex < 0 ? undefined : parts[moduleIndex + 1],
  };
}

function violation(from, to) {
  const source = location(from);
  if (from.replaceAll('\\', '/').startsWith('main/')) return undefined;
  if (!to.startsWith('.')) {
    return ['domain', 'application'].includes(source.layer)
      ? 'Inner layers cannot import packages, Node APIs, or aliases'
      : undefined;
  }
  const targetFile = path.posix.normalize(
    path.posix.join(path.posix.dirname(from.replaceAll('\\', '/')), to),
  );
  const target = location(targetFile);
  if (targetFile.startsWith('../'))
    return 'Dependencies cannot leave the API source tree';
  if (targetFile.startsWith('main/'))
    return 'Only the composition root can depend on main';
  if (source.module && target.module && source.module !== target.module)
    return 'Modules cannot import another module directly; define an explicit port';
  if (!source.module && target.module)
    return 'Shared code cannot depend on feature modules';
  if (
    source.layer &&
    (!target.layer || !allowedLayers[source.layer].has(target.layer))
  )
    return `${source.layer} cannot depend on ${target.layer ?? 'unclassified code'}`;
  return undefined;
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory()
        ? sourceFiles(file)
        : file.endsWith('.ts')
          ? [file]
          : [];
    }),
  );
  return nested.flat();
}

test('boundary rules reject infrastructure leaks and cross-module coupling', () => {
  assert.ok(violation('modules/auth/domain/user.ts', 'mongoose'));
  assert.ok(
    violation(
      'modules/auth/application/register.ts',
      '../infrastructure/user-repository.js',
    ),
  );
  assert.ok(
    violation(
      'modules/auth/presentation/routes.ts',
      '../infrastructure/user-repository.js',
    ),
  );
  assert.ok(
    violation(
      'modules/auth/application/register.ts',
      '../../clients/domain/client.js',
    ),
  );
  assert.ok(
    violation('shared/domain/id.ts', '../../modules/auth/domain/user.js'),
  );
  assert.equal(
    violation('modules/auth/application/register.ts', '../domain/user.js'),
    undefined,
  );
  assert.equal(
    violation(
      'modules/auth/infrastructure/user-repository.ts',
      '../application/ports/user-repository.js',
    ),
    undefined,
  );
  assert.equal(
    violation(
      'main/create-app.ts',
      '../modules/auth/infrastructure/user-repository.js',
    ),
    undefined,
  );
});

test('API source respects Clean Architecture dependency boundaries', async () => {
  const violations = [];
  for (const file of await sourceFiles(sourceRoot)) {
    const relative = path.relative(sourceRoot, file);
    const content = await readFile(file, 'utf8');
    const ast = ts.createSourceFile(
      file,
      content,
      ts.ScriptTarget.Latest,
      true,
    );
    function check(specifier) {
      if (!specifier || !ts.isStringLiteralLike(specifier)) {
        violations.push(`${relative}: nonliteral dependency cannot be checked`);
        return;
      }
      const problem = violation(relative, specifier.text);
      if (problem)
        violations.push(`${relative} → ${specifier.text}: ${problem}`);
    }
    function visit(node) {
      if (
        ts.isImportDeclaration(node) ||
        (ts.isExportDeclaration(node) && node.moduleSpecifier)
      )
        check(node.moduleSpecifier);
      if (
        ts.isImportEqualsDeclaration(node) &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        check(node.moduleReference.expression);
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) &&
            node.expression.text === 'require'))
      )
        check(node.arguments[0]);
      ts.forEachChild(node, visit);
    }
    visit(ast);
  }
  assert.deepEqual(violations, [], violations.join('\n'));
});
