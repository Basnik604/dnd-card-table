import fs from 'node:fs';
import ts from 'typescript';

// Exercise the real handlers/renderers without opening the production listener
// or connecting to a user's database.
export function serverFunctions(names, dependencies = {}) {
  const source = fs.readFileSync(new URL('../../src/web/server.mjs', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('server.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const declarations = new Map();
  for (const node of ast.statements) {
    if (ts.isFunctionDeclaration(node)) declarations.set(node.name.text,node.getText(ast));
    if (ts.isVariableStatement(node)&&node.declarationList.declarations.length===1) {
      const declaration=node.declarationList.declarations[0];
      if(ts.isIdentifier(declaration.name)) declarations.set(declaration.name.text,node.getText(ast));
    }
  }
  for (const name of names) if (!declarations.has(name)) throw new Error(`Missing server function: ${name}`);
  return new Function(...Object.keys(dependencies), names.map(n => declarations.get(n)).join('\n') +
    `\nreturn {${names.join(',')}};`)(...Object.values(dependencies));
}
