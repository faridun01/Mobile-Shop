import ts from 'typescript';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const files = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? files(path.join(root, e.name)) : /\.tsx?$/.test(e.name) && !/\.test\./.test(e.name) ? [path.join(root, e.name)] : []);
const parse = (file: string) => ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
const location = (sf: ts.SourceFile, node: ts.Node) => ({ file: sf.fileName.replaceAll('\\', '/'), line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1 });
const endpoint = (n?: ts.Node): string | null => {
  if (!n) return null;
  if (ts.isStringLiteralLike(n)) return n.text;
  if (ts.isTemplateExpression(n)) return n.head.text + n.templateSpans.map(s => '{param}' + s.literal.text).join('');
  return null;
};
const visit = (n: ts.Node, fn: (n: ts.Node) => void) => { fn(n); ts.forEachChild(n, c => visit(c, fn)); };
const routes: any[] = [], requests: any[] = [], controls: any[] = [];
for (const file of files('server/src')) {
  const sf = parse(file);
  visit(sf, n => {
    if (!ts.isCallExpression(n) || !ts.isPropertyAccessExpression(n.expression)) return;
    const method = n.expression.name.text.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) return;
    const url = endpoint(n.arguments[0]);
    if (url?.startsWith('/api/')) routes.push({ method, url: url.slice(4), ...location(sf, n) });
  });
}
for (const file of files('src')) {
  const sf = parse(file);
  visit(sf, n => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === 'apiClient') {
      let method = 'GET';
      const opts = n.arguments[1];
      if (opts && ts.isObjectLiteralExpression(opts)) {
        const prop = opts.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(sf) === 'method');
        if (prop && ts.isPropertyAssignment(prop)) method = endpoint(prop.initializer) ?? '{dynamic}';
      }
      const url = endpoint(n.arguments[0]);
      const clean = url?.split('?')[0];
      const matches = routes.filter(r => r.method === method && clean && new RegExp('^' + r.url.replaceAll('{param}', ':dynamic').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/:[A-Za-z0-9_]+/g, '[^/]+') + '$').test(clean));
      requests.push({ method, url, status: !url || !url.startsWith('/') || method === '{dynamic}' || clean?.endsWith('{param}') && !clean.endsWith('/{param}') ? 'dynamic-review' : matches.length ? 'route-found' : 'MISSING', routes: matches, ...location(sf, n) });
    }
    if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
      const tag = n.tagName.getText(sf);
      if (!['button', 'Button', 'select', 'Select', 'input', 'Input', 'form'].includes(tag)) return;
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      let binding: string | undefined;
      if (tag === 'button' || tag === 'Button') {
        if (attrs.some(a => a.name.getText(sf) === 'onClick')) binding = 'click-handler';
        else if (attrs.some(a => a.name.getText(sf) === 'type' && a.initializer && endpoint(a.initializer) === 'submit')) binding = 'form-submit';
        else if (n.attributes.properties.some(ts.isJsxSpreadAttribute)) binding = 'forwarded-props';
        else if (attrs.some(a => a.name.getText(sf) === 'disabled' && !a.initializer)) binding = 'disabled';
        else {
          let parent = n.parent?.parent;
          while (parent) {
            if (ts.isJsxElement(parent) && parent.openingElement.attributes.properties.some(a => ts.isJsxAttribute(a) && a.name.getText(sf) === 'onClick')) { binding = 'parent-click-handler'; break; }
            parent = parent.parent;
          }
          binding ??= 'REVIEW';
        }
      }
      controls.push({ tag, binding, handlers: attrs.filter(a => /^on/.test(a.name.getText(sf))).map(a => ({ event: a.name.getText(sf), handler: a.initializer?.getText(sf) })), attributes: attrs.filter(a => ['type', 'disabled', 'aria-label', 'title'].includes(a.name.getText(sf))).map(a => a.getText(sf)), ...location(sf, n) });
    }
  });
}
mkdirSync('output/ui-backend-audit', { recursive: true });
const report = { routes, requests, controls, counts: { routes: routes.length, requests: requests.length, controls: controls.length, missing: requests.filter(r => r.status === 'MISSING').length, dynamic: requests.filter(r => r.status === 'dynamic-review').length, buttonBindingsForReview: controls.filter(c => c.binding === 'REVIEW').length } };
writeFileSync('output/ui-backend-audit/contracts.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.counts));
for (const r of requests.filter(r => r.status !== 'route-found')) console.log(JSON.stringify(r));
for (const control of controls.filter(c => c.binding === 'REVIEW')) console.log('BUTTON REVIEW', JSON.stringify(control));
process.exitCode = report.counts.missing || report.counts.buttonBindingsForReview ? 1 : 0;
