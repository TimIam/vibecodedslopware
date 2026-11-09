import * as acorn from 'acorn';
import fs from 'fs'; import path from 'path';
const root = '../../the-endgame-is-me/js';
const files = [...fs.readdirSync(root).filter(f=>f.endsWith('.js')).map(f=>f), ...fs.readdirSync(root+'/levels').map(f=>'levels/'+f)];
const counts = {}, methods = {}, globals = {}, ctxm = {}, perFile = {};
const interesting = new Set(['ClassDeclaration','ClassExpression','ThisExpression','YieldExpression','AwaitExpression','LabeledStatement','ForInStatement','TryStatement','ThrowStatement','NewExpression','RegExpLiteral','TaggedTemplateExpression','SequenceExpression','DoWhileStatement','SwitchStatement','ArrayPattern','ObjectPattern','RestElement','SpreadElement','AssignmentPattern','ChainExpression','UpdateExpression','Getter','Setter','FunctionExpression','typeof','delete','in','instanceof','void','Generator','Async']);
function walk(n, f, file) {
  if (!n || typeof n.type !== 'string') return;
  counts[n.type] = (counts[n.type]||0)+1;
  let tag = null;
  if (n.type==='Literal' && n.regex) tag='RegExpLiteral';
  if (n.type==='UnaryExpression' && ['typeof','delete','void'].includes(n.operator)) tag=n.operator;
  if (n.type==='BinaryExpression' && ['in','instanceof'].includes(n.operator)) tag=n.operator;
  if (n.type==='Property' && n.kind==='get') tag='Getter';
  if (n.type==='Property' && n.kind==='set') tag='Setter';
  if ((n.type==='FunctionDeclaration'||n.type==='FunctionExpression'||n.type==='ArrowFunctionExpression') && n.generator) tag='Generator';
  if ((n.type==='FunctionDeclaration'||n.type==='FunctionExpression'||n.type==='ArrowFunctionExpression') && n.async) tag='Async';
  for (const t of [n.type, tag]) if (t && interesting.has(t)) { (perFile[t] ||= {})[file] = ((perFile[t]||{})[file]||0)+1; }
  if (n.type==='NewExpression') { const nm = n.callee.name || '?'; globals['new '+nm]=(globals['new '+nm]||0)+1; }
  if (n.type==='CallExpression' && n.callee.type==='MemberExpression' && !n.callee.computed) {
    const m = n.callee.property.name; const o = n.callee.object;
    if (o.type==='Identifier' && /^[A-Z]/.test(o.name) && ['Math','Object','Array','JSON','Number','String','Date','Promise','Symbol','performance','localStorage','document','window','console'].includes(o.name)) globals[o.name+'.'+m]=(globals[o.name+'.'+m]||0)+1;
    else methods[m]=(methods[m]||0)+1;
    if (o.type==='Identifier' && /^(ctx|c|x|cx|tctx|k)$/.test(o.name)) ctxm[m]=(ctxm[m]||0)+1;
  }
  if (n.type==='MemberExpression' && !n.computed && n.object.type==='Identifier' && ['document','window','localStorage','navigator','performance','location','history'].includes(n.object.name)) globals[n.object.name+'.'+n.property.name+' @'+file]=(globals[n.object.name+'.'+n.property.name+' @'+file]||0)+1;
  for (const k in n) { const v = n[k]; if (k==='type') continue; if (Array.isArray(v)) v.forEach(c=>walk(c,f,file)); else if (v && typeof v==='object' && v.type) walk(v,f,file); }
}
for (const f of files) { const src = fs.readFileSync(path.join(root,f),'utf8'); const ast = acorn.parse(src,{ecmaVersion:'latest',sourceType:'module'}); walk(ast,null,f); }
console.log('PER FILE'); for (const k in perFile) console.log(k, JSON.stringify(perFile[k]));
console.log('METHODS', Object.entries(methods).sort((a,b)=>b[1]-a[1]).map(e=>e.join(':')).join(' '));
console.log('GLOBALS', Object.entries(globals).sort().map(e=>e.join(':')).join('  '));
