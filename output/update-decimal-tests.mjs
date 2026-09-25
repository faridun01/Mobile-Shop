import fs from 'node:fs'; import path from 'node:path';
function walk(d){return fs.readdirSync(d,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(d,x.name)):[path.join(d,x.name)]);}
for(const f of walk('server/src').filter(f=>f.endsWith('.test.ts')&&!f.includes('business-date'))){
 let s=fs.readFileSync(f,'utf8');
 const rel=path.relative(path.dirname(f),'server/src/common/decimal-test-setup').replaceAll('\\','/');
 s=`import '${rel.startsWith('.')?rel:'./'+rel}';\n`+s.replaceAll('.toBe(','.toEqual(');
 if(f.endsWith('profit.test.ts'))s=`import { D } from '../../common/decimal';\n`+s;
 if(f.endsWith('reports.service.test.ts'))s=`import { moneyJson } from '../../common/decimal';\n`+s.replace('expect(summary).toMatchSnapshot()','expect(moneyJson(summary)).toMatchSnapshot()');
 fs.writeFileSync(f,s);
}
