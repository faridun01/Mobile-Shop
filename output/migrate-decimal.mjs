import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, '.');
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const moneyName = /(?:usd|tjs|amount|balance|profit|revenue|cogs|cost|price|rate|debt|paid|remaining|allocation|delta|signed|cents|share|penalty|cash|total|usd|tjs)/i;
const isD = n => /Decimal|MoneyInput/.test(checker.typeToString(checker.getTypeAtLocation(n)));
const ops = new Map([[ts.SyntaxKind.PlusToken,'plus'],[ts.SyntaxKind.MinusToken,'minus'],[ts.SyntaxKind.AsteriskToken,'mul'],[ts.SyntaxKind.SlashToken,'div'],[ts.SyntaxKind.GreaterThanToken,'gt'],[ts.SyntaxKind.LessThanToken,'lt'],[ts.SyntaxKind.GreaterThanEqualsToken,'gte'],[ts.SyntaxKind.LessThanEqualsToken,'lte'],[ts.SyntaxKind.EqualsEqualsEqualsToken,'eq'],[ts.SyntaxKind.EqualsEqualsToken,'eq'],[ts.SyntaxKind.ExclamationEqualsEqualsToken,'eq'],[ts.SyntaxKind.ExclamationEqualsToken,'eq']]);
for (const sf of program.getSourceFiles()) {
 const file=sf.fileName.replaceAll('\\','/');
 if ((!file.includes('server/src/') && !file.includes('server/scripts/') && !file.includes('/scripts/') && !file.startsWith('scripts/')) || file.includes('node_modules') || file.includes('.test.') || file.includes('/common/') || file.includes('/auth/') || file.includes('/websocket/') || file.includes('/prisma/')) continue;
 let changed=false;
 function relevant(n) { return isD(n) || moneyName.test(n.getText(sf)); }
 function wrap(n) { changed=true; return `D(${render(n)})`; }
 function render(n) {
  if (ts.isBinaryExpression(n)) {
   const k=n.operatorToken.kind;
   const lt=checker.getTypeAtLocation(n.left), rt=checker.getTypeAtLocation(n.right);
   const stringSide=(lt.flags & ts.TypeFlags.StringLike)||(rt.flags & ts.TypeFlags.StringLike);
   if (ops.has(k) && (isD(n.left)||isD(n.right)||(!stringSide && relevant(n))) && !(ts.isStringLiteral(n.left)||ts.isStringLiteral(n.right)) && !(n.left.getText(sf).includes('typeof ')||n.right.getText(sf).includes('typeof '))) {
    // Never reinterpret text concatenation, ids, or enum equality as decimal math.
    if (!isD(n.left)&&!isD(n.right) && (stringSide || (lt.flags & ts.TypeFlags.BooleanLike) || (rt.flags & ts.TypeFlags.BooleanLike))) return children(n);
    const out=`${wrap(n.left)}.${ops.get(k)}(${render(n.right)})`;
    return [ts.SyntaxKind.ExclamationEqualsEqualsToken,ts.SyntaxKind.ExclamationEqualsToken].includes(k)?`!${out}`:out;
   }
   if ([ts.SyntaxKind.PlusEqualsToken,ts.SyntaxKind.MinusEqualsToken].includes(k) && relevant(n.left)) {
    changed=true; return `${render(n.left)} = D(${render(n.left)}).${k===ts.SyntaxKind.PlusEqualsToken?'plus':'minus'}(${render(n.right)})`;
   }
  }
  if (ts.isPrefixUnaryExpression(n) && relevant(n.operand) && [ts.SyntaxKind.MinusToken,ts.SyntaxKind.PlusToken].includes(n.operator)) return `${wrap(n.operand)}${n.operator===ts.SyntaxKind.MinusToken?'.negated()':''}`;
  if (ts.isCallExpression(n)) {
   const name=n.expression.getText(sf);
   if (['Math.abs','Math.sign','Math.floor','Math.round'].includes(name) && n.arguments.some(relevant)) {
    const methods={'Math.abs':'abs','Math.sign':'sign','Math.floor':'floor','Math.round':'round'};
    if(name==='Math.sign') return `${wrap(n.arguments[0])}.isNegative() ? -1 : 1`;
    return `${wrap(n.arguments[0])}.${methods[name]}()`;
   }
   if(['Math.min','Math.max'].includes(name) && n.arguments.some(relevant)) { changed=true; return `decimal${name==='Math.min'?'Min':'Max'}(${n.arguments.map(render).join(', ')})`; }
   if(name==='Number' && n.arguments.length && relevant(n.arguments[0])) return wrap(n.arguments[0]);
   if(ts.isPropertyAccessExpression(n.expression)&&n.expression.name.text==='reduce' && n.arguments.length===2 && ts.isNumericLiteral(n.arguments[1]) && relevant(n.arguments[0])) {changed=true; return `${render(n.expression)}(${render(n.arguments[0])}, D(${n.arguments[1].text}))`;}
  }
  if ((ts.isVariableDeclaration(n)||ts.isPropertyAssignment(n)) && n.initializer && ts.isNumericLiteral(n.initializer) && moneyName.test(n.name.getText(sf))) {changed=true; return n.getText(sf).slice(0,n.initializer.getStart(sf)-n.getStart(sf))+`D(${n.initializer.text})`;}
  if (n.kind===ts.SyntaxKind.NumberKeyword && n.parent.name && moneyName.test(n.parent.name.getText(sf)) && !/percent|count|index|length/i.test(n.parent.name.getText(sf))) { changed=true; return 'MoneyInput'; }
  // JSON columns contain numbers at their explicit persistence boundary.
  if(ts.isPropertyAssignment(n)&&['financialDetails','snapshot','ownerProfitAllocations'].includes(n.name.getText(sf)) && !n.initializer.getText(sf).startsWith('moneyJson(')) {changed=true; return `${n.name.getText(sf)}: moneyJson(${render(n.initializer)})`;}
  if(ts.isShorthandPropertyAssignment(n)&&['financialDetails','snapshot','ownerProfitAllocations'].includes(n.name.text)) {changed=true; return `${n.name.text}: moneyJson(${n.name.text})`;}
  return children(n);
 }
 function children(n) {
  let pos=n.getStart(sf), out='';
  n.forEachChild(c=>{out+=sf.text.slice(pos,c.getStart(sf))+render(c);pos=c.end;});
  return out+sf.text.slice(pos,n.end);
 }
 let out=render(sf);
 if(changed){
  const module=path.relative(path.dirname(file),'server/src/common/decimal').replaceAll('\\','/');
  out=`import { D, decimalMin, decimalMax, moneyJson, type MoneyInput } from '${module.startsWith('.')?module:'./'+module}';\n`+out;
  fs.writeFileSync(file,out);console.log(file);
 }
}
