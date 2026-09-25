import fs from 'node:fs';
import path from 'node:path';
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);}
for(const file of [...walk('server'),...walk('scripts')].filter(f=>f.endsWith('.ts')&&!f.endsWith('.test.ts'))){
 let s=fs.readFileSync(file,'utf8');
 s=s.replace(/(!?)D\(([\w.]+)\)\.eq\((undefined|null)\)/g,(_,not,v,nil)=>`${v} ${not?'!==':'==='} ${nil}`);
 s=s.replace(/financialDetails: moneyJson\(true\)/g,'financialDetails: true');
 s=s.replace(/exchangeRate\?: number/g,'exchangeRate?: MoneyInput');
 s=s.replace(/new Map<string, number>\(\)/g,'new Map<string, MoneyInput>()');
 s=s.replace(/D\(b\.(\w+)\)\.minus\(a\.(\w+)\)/g,'D(b.$1).comparedTo(a.$2)');
 s=s.replace(/([cm])\.(amountUsd|revenueUsd|profitUsd)\.toFixed/g,'D($1.$2).toFixed');
 s=s.replace(/!itemCostUsd/g,'D(itemCostUsd).isZero()');
 fs.writeFileSync(file,s);
}
