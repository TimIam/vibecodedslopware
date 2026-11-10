// A small JavaScript → Lua 5.1 transpiler, sized for The Endgame is Me's own modules: plain ES modules, no classes,
// no `this`, no generators. Arrays become zero-based tables with a `length` field (see src/rt.lua), so indexing
// carries over unchanged. Anything it does not understand is a build error, never a silent guess.

import * as acorn from 'acorn';

const LUA_KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or',
  'repeat', 'return', 'then', 'true', 'until', 'while']);

// method names that go through the runtime, which looks at what the receiver is
const BUILTIN_METHODS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'slice', 'subarray', 'concat', 'indexOf', 'includes', 'join', 'reverse',
  'map', 'filter', 'forEach', 'some', 'every', 'find', 'findIndex', 'reduce', 'fill', 'at', 'flat', 'sort', 'add', 'has', 'get', 'set', 'delete', 'clear',
  'keys', 'values', 'entries', 'split', 'startsWith', 'endsWith', 'trim', 'padStart', 'padEnd', 'toUpperCase', 'toLowerCase', 'charCodeAt', 'replace',
  'replaceAll', 'toFixed', 'toString', 'charAt']);
const METHOD_ALIAS = Object.assign(Object.create(null), { repeat: 'rep' });
// host objects (canvases and their contexts) are Lua objects with real methods: called with a colon
const COLON_METHODS = new Set(['fillRect', 'drawImage', 'clearRect', 'getContext', 'putImageData', 'createImageData', 'getImageData', 'setTransform', 'translate',
  'createLinearGradient', 'addColorStop', 'beginPath', 'drawDithered']);
const BOOL_METHODS = new Set(['some', 'every', 'includes', 'has', 'startsWith', 'endsWith']);
const NUM_METHODS = new Set(['indexOf', 'findIndex', 'push', 'charCodeAt', 'unshift']);
const STR_METHODS = new Set(['charAt', 'join', 'toFixed', 'toUpperCase', 'toLowerCase', 'trim', 'padStart', 'padEnd', 'toString', 'replace', 'replaceAll', 'repeat']);
const OBJ_METHODS = new Set(['filter', 'map', 'concat', 'split', 'sort', 'reverse', 'splice']);

const MATH_DIRECT = { __proto__: null, floor: 'floor', ceil: 'ceil', abs: 'abs', sin: 'sin', cos: 'cos', tan: 'tan', atan2: 'atan2', atan: 'atan', asin: 'asin', acos: 'acos',
  sqrt: 'sqrt', exp: 'exp', pow: 'pow', min: 'min', max: 'max', random: 'random', log: 'log' };
const MATH_RT = { __proto__: null, hypot: 'hypot', sign: 'sign', imul: 'imul', tanh: 'tanh', trunc: 'trunc' };
const HOST_GLOBALS = new Set(['makeScreen', 'keyLabel', 'waterLayer', 'teleArc', 'lean', 'document', 'window', 'localStorage', 'navigator', 'location', 'matchMedia', 'requestAnimationFrame', 'cancelAnimationFrame',
  'setTimeout', 'clearTimeout', 'addEventListener', 'removeEventListener', 'atob', 'btoa', 'OffscreenCanvas', 'ImageData', 'innerWidth', 'innerHeight', 'JSON']);
const TYPED = new Set(['Float32Array', 'Float64Array', 'Uint8Array', 'Uint16Array', 'Int16Array', 'Int32Array', 'Uint32Array', 'Int8Array', 'Uint8ClampedArray']);

class Scope {
  constructor(parent, kind) { this.parent = parent; this.kind = kind; this.vars = new Map(); }
  declare(name, info = {}) { this.vars.set(name, info); return info; }
  lookup(name) { for (let s = this; s; s = s.parent) { const v = s.vars.get(name); if (v) return v; } return null; }
}

export function transpile(src, opts) {
  const { name, resolve, patches = [], overrides = {}, exportTypes = {} } = opts;
  for (const [from, to] of patches) {
    const before = src;
    src = typeof from === 'string' ? src.split(from).join(to) : src.replace(from, to);
    if (src === before) throw new Error(`${name}: patch did not apply: ${String(from).slice(0, 80)}`);
  }
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const used = new Set();        // runtime helpers this module needs
  const mathUsed = new Set();
  const imports = new Map();     // module name → local alias
  const fnTypes = {};            // top-level function name → return type, when known
  let tmp = 0, nanUsed = false;
  const T = () => `__t${++tmp}`;
  const fail = (node, msg) => { throw new Error(`${name}:${node.loc?.start.line}: ${msg}`); };
  const rt = n => { used.add(n); return '__' + n; };
  const mth = n => { mathUsed.add(n); return '__m' + n; };

  const lname = n => LUA_KEYWORDS.has(n) || n === 'M' || n === 'RT' || n === 'math' || n === 'ns' ? n + '_' : n;
  const isName = s => /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) && !LUA_KEYWORDS.has(s);
  const prop = (o, k) => isName(k) ? `${o}.${k}` : `${o}[${q(k)}]`;
  function q(s) {
    let out = '"';
    for (const ch of Buffer.from(String(s), 'utf8')) {
      if (ch === 34) out += '\\"'; else if (ch === 92) out += '\\\\'; else if (ch === 10) out += '\\n'; else if (ch === 13) out += '\\r';
      else if (ch < 32 || ch > 126) out += '\\' + String(ch).padStart(3, '0'); else out += String.fromCharCode(ch);
    }
    return out + '"';
  }
  const num = v => Number.isNaN(v) ? '(0/0)' : v === Infinity ? 'math.huge' : String(v);

  // ------------------------------------------------------------------------------------------------ module scope

  const modScope = new Scope(null, 'module');
  for (const st of ast.body) {
    if (st.type === 'ImportDeclaration') {
      const mod = resolve(st.source.value);
      let alias = imports.get(mod);
      if (!alias) { alias = '__I' + imports.size; imports.set(mod, alias); }
      for (const sp of st.specifiers) {
        if (sp.type === 'ImportNamespaceSpecifier') modScope.declare(sp.local.name, { ref: alias, type: 'obj', ns: mod });
        else if (sp.type === 'ImportDefaultSpecifier') modScope.declare(sp.local.name, { ref: prop(alias, 'default'), type: 'obj' });
        else modScope.declare(sp.local.name, { ref: prop(alias, sp.imported.name), fnType: exportTypes[mod]?.[sp.imported.name] });
      }
    }
  }
  const topDecl = st => st.type === 'ExportNamedDeclaration' || st.type === 'ExportDefaultDeclaration' ? st.declaration : st;
  for (const st0 of ast.body) {
    const st = topDecl(st0);
    if (!st) continue;
    if (st.type === 'FunctionDeclaration') modScope.declare(st.id.name, { ref: prop('M', st.id.name), fn: st.id.name });
    else if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const n of patNames(d.id)) modScope.declare(n, { ref: prop('M', n), fn: n });
  }

  function patNames(p, out = []) {
    if (!p) return out;
    if (p.type === 'Identifier') out.push(p.name);
    else if (p.type === 'ObjectPattern') for (const pr of p.properties) patNames(pr.type === 'RestElement' ? pr.argument : pr.value, out);
    else if (p.type === 'ArrayPattern') for (const el of p.elements) patNames(el, out);
    else if (p.type === 'AssignmentPattern') patNames(p.left, out);
    else if (p.type === 'RestElement') patNames(p.argument, out);
    return out;
  }

  // every identifier mentioned inside a subtree (an over-approximation of what a closure might capture)
  function mentions(node, out = new Set()) {
    if (!node || typeof node.type !== 'string') return out;
    if (node.type === 'Identifier') { out.add(node.name); return out; }
    for (const k in node) {
      if (k === 'type' || k === 'loc' || k === 'start' || k === 'end') continue;
      if (node.type === 'MemberExpression' && k === 'property' && !node.computed) continue;
      if (node.type === 'Property' && k === 'key' && !node.computed) continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => mentions(c, out)); else if (v && typeof v === 'object') mentions(v, out);
    }
    return out;
  }
  function closures(node, out = []) {
    if (!node || typeof node.type !== 'string') return out;
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') { out.push(node); return out; }
    for (const k in node) {
      if (k === 'type' || k === 'loc') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach(c => closures(c, out)); else if (v && typeof v === 'object') closures(v, out);
    }
    return out;
  }
  // does this subtree contain `kind` (ContinueStatement / BreakStatement) aimed at the enclosing loop?
  function hasJump(node, kind, inSwitch = false) {
    if (!node || typeof node.type !== 'string') return false;
    if (node.type === kind) return kind === 'ContinueStatement' || !inSwitch;
    if (/^(For|ForOf|ForIn|While|DoWhile)Statement$/.test(node.type) || /Function/.test(node.type)) return false;
    const sw = inSwitch || node.type === 'SwitchStatement';
    for (const k in node) {
      if (k === 'type' || k === 'loc') continue;
      const v = node[k];
      if (Array.isArray(v)) { if (v.some(c => hasJump(c, kind, sw))) return true; } else if (v && typeof v === 'object' && hasJump(v, kind, sw)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------------------------------------ types

  function ty(n, sc) {
    switch (n.type) {
      case 'Literal': return typeof n.value === 'number' ? 'num' : typeof n.value === 'string' ? 'str' : typeof n.value === 'boolean' ? 'bool' : null;
      case 'TemplateLiteral': return 'str';
      case 'ArrayExpression': case 'ObjectExpression': case 'FunctionExpression': case 'ArrowFunctionExpression': case 'NewExpression': return 'obj';
      case 'Identifier': {
        if (n.name === 'undefined') return null;
        if (n.name === 'NaN' || n.name === 'Infinity') return 'num';
        return sc.lookup(n.name)?.type || null;
      }
      case 'UnaryExpression': return n.operator === '!' ? 'bool' : n.operator === 'typeof' ? 'str' : n.operator === 'void' || n.operator === 'delete' ? null : 'num';
      case 'UpdateExpression': return 'num';
      case 'BinaryExpression': {
        if (['==', '===', '!=', '!==', '<', '>', '<=', '>=', 'in', 'instanceof'].includes(n.operator)) return 'bool';
        if (n.operator === '+') { const a = ty(n.left, sc), b = ty(n.right, sc); return a === 'str' || b === 'str' ? 'str' : 'num'; }
        return 'num';
      }
      case 'LogicalExpression': { const a = ty(n.left, sc), b = ty(n.right, sc); return a === b ? a : null; }
      case 'ConditionalExpression': { const a = ty(n.consequent, sc), b = ty(n.alternate, sc); return a === b ? a : null; }
      case 'AssignmentExpression': return n.operator === '=' ? ty(n.right, sc) : (n.operator === '+=' && ty(n.left, sc) === 'str') ? 'str' : /^(\|\||&&|\?\?)=$/.test(n.operator) ? null : 'num';
      case 'MemberExpression':
        if (!n.computed && (n.property.name === 'length' || n.property.name === 'size')) return 'num';
        if (n.object.type === 'Identifier' && n.object.name === 'Math' && !sc.lookup('Math')) return 'num';
        return null;
      case 'ChainExpression': return null;
      case 'CallExpression': {
        const c = n.callee;
        if (c.type === 'MemberExpression' && !c.computed) {
          const m = c.property.name, o = c.object;
          if (o.type === 'Identifier' && !sc.lookup(o.name)) {
            if (o.name === 'Math') return 'num';
            if (o.name === 'Array' && m === 'isArray') return 'bool';
            if (o.name === 'Number' && (m === 'isFinite' || m === 'isInteger')) return 'bool';
            if (o.name === 'String') return 'str';
            if (o.name === 'Object' || o.name === 'Array') return 'obj';
          }
          if (o.type === 'Identifier') { const v = sc.lookup(o.name); if (v?.ns && exportTypes[v.ns]?.[m]) return exportTypes[v.ns][m]; }
          if (BOOL_METHODS.has(m)) return 'bool';
          if (NUM_METHODS.has(m)) return 'num';
          if (STR_METHODS.has(m)) return 'str';
          if (OBJ_METHODS.has(m)) return 'obj';
          return null;
        }
        if (c.type === 'Identifier') {
          const v = sc.lookup(c.name);
          if (!v) return c.name === 'String' ? 'str' : c.name === 'Number' || c.name === 'parseInt' || c.name === 'parseFloat' ? 'num' : c.name === 'isNaN' ? 'bool' : null;
          if (v.fnType) return v.fnType;
          if (v.fn && fnTypes[v.fn]) return fnTypes[v.fn];
          return v.ret || null;
        }
        return null;
      }
    }
    return null;
  }
  // what a function returns, if every return agrees
  function retType(fn, sc) {
    const inner = new Scope(sc, 'fn');
    for (const p of fn.params) for (const nm of patNames(p)) inner.declare(nm, {});
    if (fn.body.type !== 'BlockStatement') return ty(fn.body, inner);
    const types = new Set();
    (function walk(node) {
      if (!node || typeof node.type !== 'string' || /Function/.test(node.type)) return;
      if (node.type === 'ReturnStatement') { types.add(node.argument ? ty(node.argument, inner) : 'nil'); return; }
      for (const k in node) { if (k === 'type' || k === 'loc') continue; const v = node[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    })(fn.body);
    // falling off the end returns undefined
    const last = fn.body.body[fn.body.body.length - 1];
    if (!last || last.type !== 'ReturnStatement') types.add('nil');
    types.delete('nil');   // undefined is falsy either way; fine for 'bool' and 'obj'
    if (types.size === 1) { const t = [...types][0]; return t === 'bool' || t === 'obj' ? t : (fn.body.body.some(s => s.type !== 'ReturnStatement') || !last ? null : t); }
    return null;
  }
  for (let pass = 0; pass < 3; pass++) {
    for (const st0 of ast.body) {
      const st = topDecl(st0);
      if (!st) continue;
      if (st.type === 'FunctionDeclaration') { const t = retType(st, modScope); if (t) fnTypes[st.id.name] = t; }
      else if (st.type === 'VariableDeclaration') for (const d of st.declarations) {
        if (d.id.type !== 'Identifier' || !d.init) continue;
        if (/Function/.test(d.init.type)) { const t = retType(d.init, modScope); if (t) fnTypes[d.id.name] = t; }
        else if (st.kind === 'const') { const t = ty(d.init, modScope); if (t) modScope.lookup(d.id.name).type = t; }
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ expressions

  const simple = n => n.type === 'Identifier' || n.type === 'Literal' && !n.regex
    || n.type === 'MemberExpression' && !n.optional && simple(n.object) && (!n.computed || simple(n.property));
  // a variable's type is only a promise of non-nil when it is a const
  const sure = (n, sc) => n.type !== 'Identifier' || !sc.lookup(n.name) || sc.lookup(n.name).sure !== false;
  const luaTruthy = (n, sc) => { const t = ty(n, sc); return (t === 'num' || t === 'str' || t === 'obj') && sure(n, sc); };

  function ident(n, sc) {
    const v = sc.lookup(n.name);
    if (v) return v.ref || lname(n.name);
    switch (n.name) {
      case 'undefined': return 'nil';
      case 'NaN': return '(0/0)';
      case 'Infinity': return 'math.huge';
      case 'console': return 'RT.console';
      case 'parseInt': return rt('parseInt');
      case 'parseFloat': return rt('parseFloat');
      case 'String': return rt('str');
      case 'Number': return rt('Number');
    }
    if (HOST_GLOBALS.has(n.name)) return `RT.host.${n.name}`;
    if (TYPED.has(n.name)) return q(n.name);
    fail(n, `unknown global ${n.name}`);
  }

  // an expression used only for its truth
  function cond(n, sc) {
    if (n.type === 'LogicalExpression' && n.operator !== '??') return `(${cond(n.left, sc)} ${n.operator === '&&' ? 'and' : 'or'} ${cond(n.right, sc)})`;
    if (n.type === 'UnaryExpression' && n.operator === '!') return `(not ${cond(n.argument, sc)})`;
    if (n.type === 'Literal' && typeof n.value === 'boolean') return String(n.value);
    const t = sure(n, sc) ? ty(n, sc) : null, e = E(n, sc);
    if (t === 'bool' || t === 'obj') return e;
    if (t === 'num') return `(${e} ~= 0)`;
    if (t === 'str') return `(${e} ~= "")`;
    return `${rt('T')}(${e})`;
  }

  // Lua only lets you index or call a name, a call, an index or something in brackets
  function PX(n, sc) {
    const e = E(n, sc);
    return /^[{"#0-9-]/.test(e) || e.startsWith('function(') || e === 'nil' || e === 'true' || e === 'false' ? `(${e})` : e;
  }
  function memberTarget(n, sc) {
    // an assignable place: returns Lua text for it
    if (n.type === 'Identifier') { const v = sc.lookup(n.name); if (!v) fail(n, `assignment to unknown ${n.name}`); return v.ref || lname(n.name); }
    if (n.type === 'MemberExpression') {
      const o = PX(n.object, sc);
      return n.computed ? `${o}[${E(n.property, sc)}]` : prop(o, n.property.name);
    }
    fail(n, `cannot assign to ${n.type}`);
  }
  const isLength = n => n.type === 'MemberExpression' && !n.computed && n.property.name === 'length';

  function args(list, sc) {
    if (!list.some(a => a.type === 'SpreadElement')) return list.map(a => E(a, sc)).join(', ');
    const last = list[list.length - 1];
    if (list.slice(0, -1).every(a => a.type !== 'SpreadElement')) return [...list.slice(0, -1).map(a => E(a, sc)), `${rt('unpack')}(${rt('it')}(${E(last.argument, sc)}))`].join(', ');
    return `${rt('unpack')}(${arrayLit(list, sc)})`;
  }
  function arrayLit(els, sc) {
    if (els.some(e => e && e.type === 'SpreadElement')) return `${rt('sarr')}(${els.map(e => e.type === 'SpreadElement' ? `1, ${E(e.argument, sc)}` : `0, ${E(e, sc)}`).join(', ')})`;
    if (!els.length) return '{length=0}';
    return `{[0]=${els.map(e => e ? E(e, sc) : 'nil').join(', ')}, length=${els.length}}`;
  }
  function objectLit(n, sc) {
    const groups = [];
    let cur = null;
    for (const p of n.properties) {
      if (p.type === 'SpreadElement') { groups.push(E(p.argument, sc)); cur = null; continue; }
      if (p.kind === 'get' || p.kind === 'set') fail(p, 'getters and setters are not supported');
      if (!cur) { cur = []; groups.push(cur); }
      const key = p.computed ? `[${E(p.key, sc)}]` : p.key.type === 'Identifier' ? (isName(p.key.name) ? p.key.name : `[${q(p.key.name)}]`) : `[${q(String(p.key.value))}]`;
      cur.push(`${key}=${E(p.value, sc)}`);
    }
    const lit = g => `{${g.join(', ')}}`;
    if (groups.length === 0) return '{}';
    if (groups.length === 1 && Array.isArray(groups[0])) return lit(groups[0]);
    return mergeInto(Array.isArray(groups[0]) ? lit(groups[0]) : '{}', groups.slice(Array.isArray(groups[0]) ? 1 : 0), sc);
  }
  // target, then each source in turn: a spread (Lua text) is copied, a run of properties ("key=value" texts) is set
  function mergeInto(target, groups, sc) {
    let out = target;
    for (const g of groups) {
      if (!Array.isArray(g)) { out = `${rt('assign')}(${out}, ${g})`; continue; }
      for (let i = 0; i < g.length; i += 40) {
        const kv = g.slice(i, i + 40).map(e => { const at = e.indexOf('='); const k = e.slice(0, at), v = e.slice(at + 1); return `${k.startsWith('[') ? k.slice(1, -1) : q(k)}, ${v}`; });
        out = `${rt('assignKV')}(${out}, ${kv.join(', ')})`;
      }
    }
    return out;
  }
  // the properties of an object literal as "key=value" texts, or null if it has spreads in it
  function litProps(n, sc) {
    if (n.type !== 'ObjectExpression' || n.properties.some(p => p.type === 'SpreadElement' || p.kind === 'get' || p.kind === 'set')) return null;
    return n.properties.map(p => `${p.computed ? `[${E(p.key, sc)}]` : p.key.type === 'Identifier' ? (isName(p.key.name) ? p.key.name : `[${q(p.key.name)}]`) : `[${q(String(p.key.value))}]`}=${E(p.value, sc)}`);
  }

  function fnExpr(n, sc, selfName) {
    const inner = new Scope(sc, 'fn');
    const ps = [], pre = [];
    for (const p of n.params) {
      if (p.type === 'Identifier') { inner.declare(p.name, {}); ps.push(lname(p.name)); }
      else if (p.type === 'AssignmentPattern' && p.left.type === 'Identifier') {
        const nm = p.left.name; inner.declare(nm, {}); ps.push(lname(nm));
        pre.push(`if ${lname(nm)} == nil then ${lname(nm)} = ${E(p.right, inner)} end;`);
      } else if (p.type === 'RestElement') {
        inner.declare(p.argument.name, { type: 'obj' }); ps.push('...');
        pre.push(`local ${lname(p.argument.name)} = ${rt('pack')}(...);`);
      } else {
        const t = T(); ps.push(t);
        let pat = p;
        if (p.type === 'AssignmentPattern') { pre.push(`if ${t} == nil then ${t} = ${E(p.right, inner)} end;`); pat = p.left; }
        for (const nm of patNames(pat)) inner.declare(nm, {});
        pre.push(`local ${patNames(pat).map(lname).join(', ')};`);
        pre.push(destructure(pat, t, inner));
      }
    }
    let body;
    if (n.body.type === 'BlockStatement') body = block(n.body.body, inner, true);
    // (v, a, b) => v < a ? a : v > b ? b : v  as an if/else, like a return statement: the closure E() would wrap it in
    // is made anew on every call, and clamp() is called thousands of times a frame
    else if (n.body.type === 'ConditionalExpression' && !luaTruthy(n.body.consequent, inner)) body = condAssign(n.body, v => `do return ${v} end;`, inner);
    else body = `return ${E(n.body, inner)};`;
    return `function(${ps.join(', ')}) ${pre.join(' ')}\n${body}\nend`;
  }

  // assigns the parts of a pattern (names already declared) from the Lua expression `from`
  function destructure(pat, from, sc) {
    const out = [];
    const put = (target, value, dflt) => {
      if (target.type === 'AssignmentPattern') return put(target.left, value, target.right);
      if (target.type === 'Identifier' || target.type === 'MemberExpression') {
        const t = memberTarget(target, sc);
        out.push(`${t} = ${value};`);
        if (dflt) out.push(`if ${t} == nil then ${t} = ${E(dflt, sc)} end;`);
      } else {
        const t = T();
        out.push(`local ${t} = ${value};`);
        if (dflt) out.push(`if ${t} == nil then ${t} = ${E(dflt, sc)} end;`);
        out.push(destructure(target, t, sc));
      }
    };
    if (pat.type === 'ObjectPattern') {
      for (const p of pat.properties) {
        if (p.type === 'RestElement') fail(p, 'object rest is not supported');
        put(p.value, p.computed ? `${from}[${E(p.key, sc)}]` : prop(from, p.key.name ?? p.key.value));
      }
    } else if (pat.type === 'ArrayPattern') {
      pat.elements.forEach((el, i) => {
        if (!el) return;
        if (el.type === 'RestElement') { put(el.argument, `${rt('slice')}(${from}, ${i})`); return; }
        put(el, `${from}[${i}]`);
      });
    } else fail(pat, `cannot destructure ${pat.type}`);
    return out.join(' ');
  }

  function call(n, sc) {
    const c = n.callee;
    if (c.type === 'MemberExpression' && !c.computed) {
      const m = c.property.name, o = c.object;
      if (o.type === 'Identifier' && !sc.lookup(o.name)) {
        if (o.name === 'Math') {
          const margs = () => n.arguments.some(a => a.type === 'SpreadElement') ? args(n.arguments, sc) : n.arguments.map(a => N(a, sc)).join(', ');
          if (m === 'round') return `${mth('floor')}(${N(n.arguments[0], sc)} + 0.5)`;
          if (MATH_DIRECT[m]) return `${mth(MATH_DIRECT[m])}(${margs()})`;
          if (MATH_RT[m]) return `${rt(MATH_RT[m])}(${margs()})`;
          fail(n, `Math.${m}`);
        }
        if (o.name === 'Object') {
          if (m === 'assign' && n.arguments.length >= 2 && n.arguments.every(a => a.type !== 'SpreadElement')) {
            const groups = n.arguments.slice(1).map(a => litProps(a, sc) || E(a, sc));
            if (groups.some(Array.isArray)) return mergeInto(E(n.arguments[0], sc), groups, sc);
          }
          const f = { __proto__: null, assign: 'assign', keys: 'objKeys', values: 'objValues', entries: 'objEntries', fromEntries: 'fromEntries' }[m];
          if (!f) fail(n, `Object.${m}`);
          return `${rt(f)}(${args(n.arguments, sc)})`;
        }
        if (o.name === 'Array') {
          if (m === 'isArray') return `${rt('isArray')}(${args(n.arguments, sc)})`;
          if (m === 'from') return `${rt('arrayFrom')}(${args(n.arguments, sc)})`;
          fail(n, `Array.${m}`);
        }
        if (o.name === 'Number') {
          if (m === 'isFinite' || m === 'isInteger') return `${rt(m)}(${args(n.arguments, sc)})`;
          fail(n, `Number.${m}`);
        }
        if (o.name === 'String' && m === 'fromCharCode') return `${rt('fromCharCode')}(${args(n.arguments, sc)})`;
        if (o.name === 'Date' && m === 'now') return 'RT.now()';
        if (o.name === 'performance' && m === 'now') return 'RT.perfNow()';
      }
      if (COLON_METHODS.has(m)) return `${PX(o, sc)}:${m}(${args(n.arguments, sc)})`;
      const viaRt = BUILTIN_METHODS.has(m) || METHOD_ALIAS[m];
      // a namespace import's own function of the same name is just a function
      if (viaRt && !(o.type === 'Identifier' && sc.lookup(o.name)?.ns)) {
        const recv = E(o, sc);
        return `${rt(METHOD_ALIAS[m] || m)}(${[recv, ...(n.arguments.length ? [args(n.arguments, sc)] : [])].join(', ')})`;
      }
      return `${prop(PX(o, sc), m)}(${args(n.arguments, sc)})`;
    }
    if (c.type === 'Identifier' && !sc.lookup(c.name)) {
      if (c.name === 'isNaN') { const a = E(n.arguments[0], sc); return simple(n.arguments[0]) ? `(${a} ~= ${a})` : `${rt('isNaN')}(${a})`; }
    }
    const f = E(c, sc);
    const needParen = !(c.type === 'Identifier' || c.type === 'MemberExpression' || c.type === 'CallExpression');
    return `${needParen ? `(${f})` : f}(${args(n.arguments, sc)})`;
  }

  // a?.b.c(d): everything after the first ?. is skipped when the base is nil
  function chain(n, sc) {
    // find the innermost optional link; only one per chain is supported, and its base must be cheap to repeat
    let opt = null;
    (function find(x) {
      if (x.type === 'MemberExpression') { find(x.object); if (x.optional) opt = opt || x; }
      else if (x.type === 'CallExpression') { find(x.callee); if (x.optional) opt = opt || x; }
    })(n.expression);
    if (!opt) return E(n.expression, sc);
    const base = opt.type === 'MemberExpression' ? opt.object : opt.callee;
    opt.optional = false;
    let out;
    if (simple(base)) out = `(${E(base, sc)} and ${chain(n, sc)})`;
    else {
      const t = T(), inner = new Scope(sc, 'block');
      inner.declare(t, {});
      const stand = { type: 'Identifier', name: t, loc: base.loc };
      if (opt.type === 'MemberExpression') opt.object = stand; else opt.callee = stand;
      out = `(function() local ${t} = ${E(base, sc)}; if ${t} == nil then return nil end; return ${chain(n, inner)} end)()`;
      if (opt.type === 'MemberExpression') opt.object = base; else opt.callee = base;
    }
    opt.optional = true;
    return out;
  }

  const BIN = { '+': '+', '-': '-', '*': '*', '/': '/', '**': '^', '==': '==', '===': '==', '!=': '~=', '!==': '~=', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
  const BITS = { '&': 'band', '|': 'bor', '^': 'bxor', '<<': 'shl', '>>': 'shr', '>>>': 'ushr' };

  // a number operand: a missing property reads as NaN, as it does in JS, instead of stopping the game
  function N(n, sc) {
    const e = E(n, sc);
    if (n.type === 'MemberExpression' && !isLength(n) && !(n.object.type === 'Identifier' && n.object.name === 'Math' && !sc.lookup('Math'))) { nanUsed = true; return `(${e} or __NaN)`; }
    return e;
  }
  function binary(op, l, r, sc, node) {
    if (op === '+') {
      const a = ty(l, sc), b = ty(r, sc);
      if (a === 'str' || b === 'str') return `(${a === 'str' ? E(l, sc) : `${rt('str')}(${E(l, sc)})`} .. ${b === 'str' ? E(r, sc) : `${rt('str')}(${E(r, sc)})`})`;
    }
    if (op === '===' || op === '==' || op === '!==' || op === '!=') {
      // typeof x === 'kind'
      const tl = l.type === 'UnaryExpression' && l.operator === 'typeof' ? l : null;
      if (tl && r.type === 'Literal') {
        const x = E(tl.argument, sc), neg = op[0] === '!', w = e => neg ? `(not ${e})` : e;
        if (r.value === 'function') return w(`${rt('isfn')}(${x})`);
        if (r.value === 'object') return w(`${rt('isobj')}(${x})`);
        if (r.value === 'undefined') return `(${x} ${neg ? '~=' : '=='} nil)`;
        return `(${rt('type')}(${x}) ${neg ? '~=' : '=='} ${q(r.value)})`;
      }
    }
    if (BIN[op] && (op.startsWith('==') || op.startsWith('!='))) {
      const ch = x => x.type === 'Literal' && typeof x.value === 'string' && x.value.length === 1;
      const at = x => x.type === 'MemberExpression' && x.computed && !isLength(x) && ty(x.property, sc) !== 'str';
      if (ch(r) && at(l)) return `(${rt('ch')}(${E(l.object, sc)}, ${E(l.property, sc)}) ${BIN[op]} ${E(r, sc)})`;
      if (ch(l) && at(r)) return `(${E(l, sc)} ${BIN[op]} ${rt('ch')}(${E(r.object, sc)}, ${E(r.property, sc)}))`;
    }
    if (BIN[op] && !op.startsWith('==') && !op.startsWith('!=') && ty(l, sc) !== 'str' && ty(r, sc) !== 'str') return `(${N(l, sc)} ${BIN[op]} ${N(r, sc)})`;
    if (BIN[op]) return `(${E(l, sc)} ${BIN[op]} ${E(r, sc)})`;
    if (op === '%') return `${mth('fmod')}(${N(l, sc)}, ${N(r, sc)})`;
    if (op === '|' && r.type === 'Literal' && r.value === 0) return `${rt('i32')}(${E(l, sc)})`;
    if (op === '>>>' && r.type === 'Literal' && r.value === 0) return `${rt('u32')}(${E(l, sc)})`;
    if (BITS[op]) return `${rt(BITS[op])}(${E(l, sc)}, ${E(r, sc)})`;
    if (op === 'in') return `(${E(r, sc)}[${E(l, sc)}] ~= nil)`;
    if (op === 'instanceof') {
      if (r.type === 'Identifier' && r.name === 'Set') return `(${rt('isobj')}(${E(l, sc)}) and ${E(l, sc)}.__set == true)`;
      if (r.type === 'Identifier' && r.name === 'Map') return `(${rt('isobj')}(${E(l, sc)}) and ${E(l, sc)}.__map == true)`;
    }
    fail(node, `operator ${op}`);
  }

  // the value of `target op= value` as statements; returns Lua statement text
  function assignStmt(n, sc) {
    const op = n.operator;
    if (n.left.type === 'ObjectPattern' || n.left.type === 'ArrayPattern') {
      if (n.left.type === 'ArrayPattern' && n.right.type === 'ArrayExpression' && n.left.elements.length === n.right.elements.length)
        return `${n.left.elements.map(e => memberTarget(e, sc)).join(', ')} = ${n.right.elements.map(e => E(e, sc)).join(', ')};`;
      const t = T();
      return `do local ${t} = ${E(n.right, sc)}; ${destructure(n.left, t, sc)} end;`;
    }
    if (isLength(n.left)) {
      const o = E(n.left.object, sc);
      if (op === '=') return `${rt('setlen')}(${o}, ${E(n.right, sc)});`;
      return `${rt('setlen')}(${o}, ${binary(op.slice(0, -1), n.left, n.right, sc, n)});`;
    }
    if (n.left.type === 'MemberExpression' && n.left.computed && n.left.object.type === 'Identifier' && sc.lookup(n.left.object.name)?.arr && op === '=')
      return `${rt('seti')}(${E(n.left.object, sc)}, ${E(n.left.property, sc)}, ${E(n.right, sc)});`;
    const t = memberTarget(n.left, sc);
    if (op === '=') {
      // a = b = c
      if (n.right.type === 'AssignmentExpression' && n.right.operator === '=' && n.right.left.type !== 'ObjectPattern' && n.right.left.type !== 'ArrayPattern') {
        const v = T();
        let inner = n.right; const targets = [t];
        while (inner.type === 'AssignmentExpression' && inner.operator === '=') { targets.push(isLength(inner.left) ? null : memberTarget(inner.left, sc)); inner = inner.right; }
        if (targets.includes(null)) fail(n, 'chained assignment to length');
        return `do local ${v} = ${E(inner, sc)}; ${targets.reverse().map(x => `${x} = ${v};`).join(' ')} end;`;
      }
      if (n.right.type === 'ConditionalExpression' && !luaTruthy(n.right.consequent, sc)) return condAssign(n.right, v => `${t} = ${v};`, sc);
      const text = `${t} = ${E(n.right, sc)};`;
      if (n.left.type === 'Identifier') { const v = sc.lookup(n.left.name); if (v && !v.ref) { v.type = ty(n.right, sc) === 'str' ? 'str' : (v.type === 'str' ? null : v.type); v.sure = false; } }
      return text;
    }
    if (op === '||=') return `if not ${cond(n.left, sc)} then ${t} = ${E(n.right, sc)} end;`;
    if (op === '&&=') return `if ${cond(n.left, sc)} then ${t} = ${E(n.right, sc)} end;`;
    if (op === '??=') return `if ${t} == nil then ${t} = ${E(n.right, sc)} end;`;
    return `${t} = ${binary(op.slice(0, -1), n.left, n.right, sc, n)};`;
  }
  // c ? a : b as an if/else that hands each value to put()
  function condAssign(n, put, sc) {
    let out = `if ${cond(n.test, sc)} then ${put(E(n.consequent, sc))} `;
    let alt = n.alternate;
    while (alt.type === 'ConditionalExpression') { out += `elseif ${cond(alt.test, sc)} then ${put(E(alt.consequent, sc))} `; alt = alt.alternate; }
    return out + `else ${put(E(alt, sc))} end;`;
  }

  function E(n, sc) {
    switch (n.type) {
      case 'Literal':
        if (n.regex) fail(n, 'regular expressions are not supported');
        if (n.value === null) return 'nil';
        if (typeof n.value === 'number') return num(n.value);
        if (typeof n.value === 'string') return q(n.value);
        return String(n.value);
      case 'Identifier': return ident(n, sc);
      case 'TemplateLiteral': {
        const parts = [];
        n.quasis.forEach((qs, i) => {
          if (qs.value.cooked) parts.push(q(qs.value.cooked));
          if (i < n.expressions.length) { const e = n.expressions[i]; parts.push(ty(e, sc) === 'str' ? E(e, sc) : `${rt('str')}(${E(e, sc)})`); }
        });
        return parts.length ? `(${parts.join(' .. ')})` : '""';
      }
      case 'ArrayExpression': return arrayLit(n.elements, sc);
      case 'ObjectExpression': return objectLit(n, sc);
      case 'FunctionExpression': case 'ArrowFunctionExpression': return fnExpr(n, sc);
      case 'MemberExpression': {
        if (n.object.type === 'Identifier' && !sc.lookup(n.object.name) && !n.computed) {
          const o = n.object.name, p = n.property.name;
          if (o === 'Math') { if (p === 'PI') return 'math.pi'; if (p === 'E') return '2.718281828459045'; if (p === 'SQRT2') return '1.4142135623730951'; fail(n, `Math.${p}`); }
          if (o === 'Number') { if (p === 'MAX_SAFE_INTEGER') return '9007199254740991'; if (p === 'EPSILON') return '2.220446049250313e-16'; fail(n, `Number.${p}`); }
        }
        const o = PX(n.object, sc);
        if (isLength(n)) {
          const t = ty(n.object, sc);
          if (t === 'str') return `#${o}`;
          if (t === 'obj') return `${o}.length`;
          return simple(n.object) ? `(${o}.length or #${o})` : `${rt('len')}(${o})`;
        }
        if (n.computed && ty(n.object, sc) === 'str') return `${rt('ch')}(${o}, ${E(n.property, sc)})`;
        return n.computed ? `${o}[${E(n.property, sc)}]` : prop(o, n.property.name);
      }
      case 'ChainExpression': return chain(n, sc);
      case 'CallExpression': return call(n, sc);
      case 'NewExpression': {
        const c = n.callee.name, a = args(n.arguments, sc);
        if (c === 'Set') return `${rt('Set')}(${a})`;
        if (c === 'Map') return `${rt('Map')}(${a})`;
        if (c === 'Array') return `${rt('Array')}(${a})`;
        if (c === 'Error') return `${rt('Error')}(${a})`;
        if (TYPED.has(c)) return `${rt('typed')}(${q(c)}, ${a})`;
        if (HOST_GLOBALS.has(c)) return `RT.host.${c}.new(${a})`;
        fail(n, `new ${c}`);
      }
      case 'UnaryExpression': {
        if (n.operator === '!') return cond(n, sc);
        if (n.operator === '-') return `(-${N(n.argument, sc)})`;
        if (n.operator === '+') return ty(n.argument, sc) === 'num' ? E(n.argument, sc) : `${rt('Number')}(${E(n.argument, sc)})`;
        if (n.operator === '~') return `${rt('bnot')}(${E(n.argument, sc)})`;
        if (n.operator === 'typeof') return `${rt('typeof')}(${E(n.argument, sc)})`;
        if (n.operator === 'void') return 'nil';
        fail(n, `unary ${n.operator}`);
      }
      case 'BinaryExpression': return binary(n.operator, n.left, n.right, sc, n);
      case 'LogicalExpression': {
        const l = n.left, r = n.right, tl = ty(l, sc);
        if (n.operator === '??') {
          if (simple(l)) return `(${E(l, sc)} == nil and ${E(r, sc)} or ${E(l, sc)})`;
          const t = T();
          return `(function() local ${t} = ${E(l, sc)}; if ${t} == nil then return ${E(r, sc)} end; return ${t} end)()`;
        }
        if (n.operator === '&&') {
          if (tl === 'bool' || tl === 'obj') return `(${E(l, sc)} and ${E(r, sc)})`;
          return `(${cond(l, sc)} and ${E(r, sc)})`;
        }
        if (tl === 'bool' || tl === 'obj') return `(${E(l, sc)} or ${E(r, sc)})`;
        if (simple(l) || (l.type === 'CallExpression' && ty(l, sc) === 'num' && l.arguments.every(simple))) return `(${cond(l, sc)} and ${E(l, sc)} or ${E(r, sc)})`;
        if (simple(r)) return `${rt('orv')}(${E(l, sc)}, ${E(r, sc)})`;
        const t = T();
        return `(function() local ${t} = ${E(l, sc)}; if ${rt('T')}(${t}) then return ${t} end; return ${E(r, sc)} end)()`;
      }
      case 'ConditionalExpression': {
        if (luaTruthy(n.consequent, sc)) return `(${cond(n.test, sc)} and ${E(n.consequent, sc)} or ${E(n.alternate, sc)})`;
        return `(function() ${condAssign(n, v => `return ${v};`, sc)} end)()`;
      }
      case 'AssignmentExpression': {
        // used for its value
        if (n.left.type === 'Identifier' || n.left.type === 'MemberExpression') {
          const stmt = assignStmt(n, sc);
          if (isLength(n.left)) return `(function() ${stmt} return ${E(n.left, sc)} end)()`;
          return `(function() ${stmt} return ${memberTarget(n.left, sc)} end)()`;
        }
        fail(n, 'assignment pattern used as a value');
      }
      case 'UpdateExpression': {
        const t = memberTarget(n.argument, sc), d = n.operator === '++' ? '+' : '-';
        if (n.prefix) return `(function() ${t} = ${t} ${d} 1; return ${t} end)()`;
        const v = T();
        return `(function() local ${v} = ${t}; ${t} = ${v} ${d} 1; return ${v} end)()`;
      }
      case 'SequenceExpression': {
        const last = n.expressions[n.expressions.length - 1];
        return `(function() ${n.expressions.slice(0, -1).map(e => exprStmt(e, sc)).join(' ')} return ${E(last, sc)} end)()`;
      }
      case 'SpreadElement': fail(n, 'spread in an unexpected place');
    }
    fail(n, `expression ${n.type}`);
  }

  // ------------------------------------------------------------------------------------------------ statements

  function exprStmt(e, sc) {
    switch (e.type) {
      case 'AssignmentExpression': return assignStmt(e, sc);
      case 'UpdateExpression': {
        if (isLength(e.argument)) return `${rt('setlen')}(${E(e.argument.object, sc)}, ${E(e.argument, sc)} ${e.operator === '++' ? '+' : '-'} 1);`;
        const t = memberTarget(e.argument, sc);
        return `${t} = ${N(e.argument, sc)} ${e.operator === '++' ? '+' : '-'} 1;`;
      }
      case 'CallExpression': return call(e, sc) + ';';
      case 'LogicalExpression':
        if (e.operator === '&&') return `if ${cond(e.left, sc)} then ${exprStmt(e.right, sc)} end;`;
        if (e.operator === '||') return `if not ${cond(e.left, sc)} then ${exprStmt(e.right, sc)} end;`;
        break;
      case 'ConditionalExpression': return `if ${cond(e.test, sc)} then ${exprStmt(e.consequent, sc)} else ${exprStmt(e.alternate, sc)} end;`;
      case 'SequenceExpression': return e.expressions.map(x => exprStmt(x, sc)).join(' ');
      case 'UnaryExpression':
        if (e.operator === 'delete') return `${memberTarget(e.argument, sc)} = nil;`;
        break;
      case 'ChainExpression': {
        // a?.b(c) as a statement
        const x = e.expression;
        if (x.type === 'CallExpression') {
          let opt = null;
          (function find(y) { if (y.type === 'MemberExpression') { find(y.object); if (y.optional) opt = opt || y; } else if (y.type === 'CallExpression') { find(y.callee); if (y.optional) opt = opt || y; } })(x);
          const base = opt && (opt.type === 'MemberExpression' ? opt.object : opt.callee);
          if (opt && simple(base)) { opt.optional = false; let more = false; (function find(y) { if (y.type === 'MemberExpression') { find(y.object); if (y.optional) more = true; } else if (y.type === 'CallExpression') { find(y.callee); if (y.optional) more = true; } })(x); const out = more ? null : `if ${E(base, sc)} then ${call(x, sc)}; end;`; opt.optional = true; if (out) return out; }
        }
        break;
      }
    }
    return `local ${T()} = ${E(e, sc)};`;
  }

  const loops = [];   // { id, wrapped (body sits in repeat…until true), usesBreak, switchDepth }

  function loopBody(body, sc, loop, pre = '') {
    loop.wrapped = hasJump(body, 'ContinueStatement');
    loops.push(loop);
    const inner = new Scope(sc, 'block');
    const text = pre + (body.type === 'BlockStatement' ? block(body.body, inner) : block([body], inner));
    loops.pop();
    let out = loop.wrapped ? `repeat\n${text}\nuntil true;` : text;
    if (loop.usesBreak && (loop.wrapped)) out += `\nif __b${loop.id} then break end;`;
    return out;
  }
  const loopDecl = loop => loop.usesBreak && loop.wrapped ? `local __b${loop.id} = false;\n` : '';

  // certainly a whole number?
  function isInt(x, sc) {
    if (x.type === 'Literal') return Number.isInteger(x.value);
    if (x.type === 'UnaryExpression' && x.operator === '-') return isInt(x.argument, sc);
    if (x.type === 'BinaryExpression' && ['+', '-', '*'].includes(x.operator)) return isInt(x.left, sc) && isInt(x.right, sc);
    if (x.type === 'BinaryExpression' && ['|', '&', '>>', '>>>', '<<', '^'].includes(x.operator)) return true;
    if (x.type === 'Identifier') return !!sc.lookup(x.name)?.int;
    if (isLength(x)) return true;
    if (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && x.callee.object.name === 'Math' && !sc.lookup('Math')) {
      const m = x.callee.property.name;
      if (m === 'floor' || m === 'ceil' || m === 'round') return true;
      if (m === 'max' || m === 'min') return x.arguments.every(a => isInt(a, sc));
    }
    return false;
  }
  const mentionsLength = x => !!x && typeof x.type === 'string' && (isLength(x) || Object.keys(x).some(k => k !== 'loc' && x[k] && typeof x[k] === 'object' && (Array.isArray(x[k]) ? x[k].some(mentionsLength) : mentionsLength(x[k]))));

  // for (let i = a; i < b; i++) with nothing odd in it becomes a numeric for
  function numericFor(n, sc) {
    const { init, test, update, body } = n;
    if (!init || init.type !== 'VariableDeclaration' || init.declarations.length !== 1 || init.declarations[0].id.type !== 'Identifier' || !init.declarations[0].init) return null;
    const v = init.declarations[0].id.name;
    if (!test || test.type !== 'BinaryExpression' || test.left.type !== 'Identifier' || test.left.name !== v || !['<', '<=', '>', '>='].includes(test.operator)) return null;
    let step = null;
    if (update?.type === 'UpdateExpression' && update.argument.name === v) step = update.operator === '++' ? 1 : -1;
    else if (update?.type === 'AssignmentExpression' && update.left.name === v && (update.operator === '+=' || update.operator === '-=') && update.right.type === 'Literal') step = update.operator === '+=' ? update.right.value : -update.right.value;
    if (!step || (step > 0) !== (test.operator[0] === '<')) return null;
    // the bound must not change under the loop, and the body must not write the counter
    const bound = test.right;
    const pure = x => x.type === 'Literal' || x.type === 'Identifier' || (x.type === 'MemberExpression' && pure(x.object) && (!x.computed || pure(x.property)))
      || (x.type === 'BinaryExpression' && pure(x.left) && pure(x.right)) || (x.type === 'UnaryExpression' && pure(x.argument))
      || (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && x.callee.object.name === 'Math' && x.arguments.every(pure));
    if (!pure(bound)) return null;
    if (!Number.isInteger(step) || !isInt(init.declarations[0].init, sc)) return null;
    let bad = false;
    const boundNames = mentions(bound);
    (function walk(x) {
      if (!x || typeof x.type !== 'string' || bad) return;
      if (x.type === 'AssignmentExpression' && (patNames(x.left).some(nm => nm === v || boundNames.has(nm)) || isLength(x.left))) { bad = true; return; }
      if (x.type === 'UpdateExpression' && x.argument.type === 'Identifier' && (x.argument.name === v || boundNames.has(x.argument.name))) { bad = true; return; }
      if (x.type === 'CallExpression' && x.callee.type === 'MemberExpression' && ['push', 'pop', 'shift', 'unshift', 'splice'].includes(x.callee.property.name) && mentionsLength(bound)) { bad = true; return; }
      for (const k in x) { if (k === 'type' || k === 'loc') continue; const c = x[k]; if (Array.isArray(c)) c.forEach(walk); else if (c && typeof c === 'object') walk(c); }
    })(body);
    if (bad) return null;
    const lim = E(bound, sc);
    const limit = test.operator === '<' ? (isInt(bound, sc) ? `${lim} - 1` : `${mth('ceil')}(${lim}) - 1`) : test.operator === '>' ? (isInt(bound, sc) ? `${lim} + 1` : `${mth('floor')}(${lim}) + 1`) : lim;
    const loop = { id: ++tmp };
    const inner = new Scope(sc, 'block');
    inner.declare(v, { type: 'num', int: true });
    const text = loopBody(body, inner, loop);
    return `${loopDecl(loop)}for ${lname(v)} = ${E(init.declarations[0].init, sc)}, ${limit}${step !== 1 ? ', ' + num(step) : ''} do\n${text}\nend;`;
  }

  function declare(n, sc, forward) {
    // let / const: returns statement text; names in `forward` were declared at the top of the block already
    const out = [];
    for (const d of n.declarations) {
      const names = patNames(d.id);
      if (d.id.type === 'Identifier') {
        const nm = d.id.name;
        const isTop = sc.kind === 'module';
        const info = isTop ? sc.lookup(nm) : sc.vars.get(nm) || sc.declare(nm, {});
        const target = isTop ? info.ref : lname(nm);
        const pre = isTop || forward.has(nm) ? '' : 'local ';
        if (!d.init) { if (pre) out.push(`local ${target};`); continue; }
        if (!isTop) {
          if (/Function/.test(d.init.type)) { const t = retType(d.init, sc); if (t) info.ret = t; }
        }
        if (d.init.type === 'ConditionalExpression' && !luaTruthy(d.init.consequent, sc)) {
          if (pre) out.push(`local ${target};`);
          out.push(condAssign(d.init, v => `${target} = ${v};`, sc));
        } else out.push(`${pre}${target} = ${E(d.init, sc)};`);
        if (!isTop && (n.kind === 'const' || ty(d.init, sc) === 'str')) { const t = ty(d.init, sc); if (t) { info.type = t; if (n.kind !== 'const') info.sure = false; } }
        if (!isTop && n.kind === 'const' && isInt(d.init, sc)) info.int = true;
        if (d.init.type === 'ArrayExpression') info.arr = true;
      } else {
        const isTop = sc.kind === 'module';
        if (!isTop) for (const nm of names) if (!sc.vars.get(nm)) sc.declare(nm, {});
        const fresh = names.filter(nm => !isTop && !forward.has(nm));
        if (fresh.length) out.push(`local ${fresh.map(lname).join(', ')};`);
        if (d.id.type === 'ArrayPattern' && d.init.type === 'ArrayExpression' && d.id.elements.every(e => e && e.type === 'Identifier') && d.id.elements.length === d.init.elements.length)
          out.push(`${d.id.elements.map(e => memberTarget(e, sc)).join(', ')} = ${d.init.elements.map(e => E(e, sc)).join(', ')};`);
        else { const t = T(); out.push(`local ${t} = ${E(d.init, sc)}; ${destructure(d.id, t, sc)}`); }
      }
    }
    return out.join('\n');
  }

  function block(stmts, sc, isFnBody) {
    // names a closure mentions before (or while) they are declared need declaring up front
    const declAt = new Map();
    stmts.forEach((st, i) => {
      if (st.type === 'VariableDeclaration') for (const d of st.declarations) for (const nm of patNames(d.id)) declAt.set(nm, i);
      if (st.type === 'FunctionDeclaration') declAt.set(st.id.name, i);
    });
    const forward = new Set();
    stmts.forEach((st, i) => {
      if (st.type === 'FunctionDeclaration') { forward.add(st.id.name); }
      for (const f of closures(st.type === 'FunctionDeclaration' ? st.body : st)) for (const nm of mentions(f)) { const at = declAt.get(nm); if (at != null && at >= i) forward.add(nm); }
      if (st.type === 'FunctionDeclaration') for (const nm of mentions(st.body)) { const at = declAt.get(nm); if (at != null && at >= i) forward.add(nm); }
    });
    for (const nm of declAt.keys()) if (!sc.vars.get(nm)) sc.declare(nm, {});
    const out = [];
    if (forward.size) out.push(`local ${[...forward].map(lname).join(', ')};`);
    for (const st of stmts) out.push(S(st, sc, forward));
    return out.join('\n');
  }

  function S(n, sc, forward = new Set()) {
    switch (n.type) {
      case 'EmptyStatement': return '';
      case 'ExpressionStatement': return exprStmt(n.expression, sc);
      case 'VariableDeclaration': return declare(n, sc, forward);
      case 'FunctionDeclaration': {
        const info = sc.vars.get(n.id.name) || sc.declare(n.id.name, {});
        const t = retType(n, sc); if (t) info.ret = t;
        return `${lname(n.id.name)} = ${fnExpr(n, sc)};`;
      }
      case 'BlockStatement': return `do\n${block(n.body, new Scope(sc, 'block'))}\nend;`;
      case 'ReturnStatement': {
        if (!n.argument) return 'do return end;';
        if (n.argument.type === 'ConditionalExpression' && !luaTruthy(n.argument.consequent, sc)) return condAssign(n.argument, v => `do return ${v} end;`, sc);
        return `do return ${E(n.argument, sc)} end;`;
      }
      case 'IfStatement': {
        let out = `if ${cond(n.test, sc)} then\n${sub(n.consequent, sc)}`;
        let alt = n.alternate;
        while (alt && alt.type === 'IfStatement') { out += `\nelseif ${cond(alt.test, sc)} then\n${sub(alt.consequent, sc)}`; alt = alt.alternate; }
        if (alt) out += `\nelse\n${sub(alt, sc)}`;
        return out + '\nend;';
      }
      case 'ForStatement': {
        const nf = numericFor(n, sc);
        if (nf) return nf;
        const outer = new Scope(sc, 'block');
        const init = n.init ? (n.init.type === 'VariableDeclaration' ? declare(n.init, outer, new Set()) : exprStmt(n.init, outer)) : '';
        const loop = { id: ++tmp };
        const text = loopBody(n.body, outer, loop);
        return `do\n${init}\n${loopDecl(loop)}while ${n.test ? cond(n.test, outer) : 'true'} do\n${text}\n${n.update ? exprStmt(n.update, outer) : ''}\nend;\nend;`;
      }
      case 'WhileStatement': {
        const loop = { id: ++tmp };
        const text = loopBody(n.body, sc, loop);
        return `${loopDecl(loop)}while ${cond(n.test, sc)} do\n${text}\nend;`;
      }
      case 'DoWhileStatement': {
        const loop = { id: ++tmp };
        const text = loopBody(n.body, sc, loop);
        return `${loopDecl(loop)}while true do\n${text}\nif not ${cond(n.test, sc)} then break end;\nend;`;
      }
      case 'ForOfStatement': {
        const a = T(), i = T(), loop = { id: ++tmp };
        const inner = new Scope(sc, 'block');
        let pre;
        const decl = n.left.type === 'VariableDeclaration' ? n.left.declarations[0].id : n.left;
        if (n.left.type === 'VariableDeclaration') {
          for (const nm of patNames(decl)) inner.declare(nm, {});
          if (decl.type === 'Identifier') pre = `local ${lname(decl.name)} = ${a}[${i}]; ${i} = ${i} + 1;\n`;
          else { const e = T(); pre = `local ${e} = ${a}[${i}]; ${i} = ${i} + 1; local ${patNames(decl).map(lname).join(', ')}; ${destructure(decl, e, inner)}\n`; }
        } else pre = `${memberTarget(decl, sc)} = ${a}[${i}]; ${i} = ${i} + 1;\n`;
        const text = loopBody(n.body, inner, loop, pre);
        return `do\nlocal ${a}, ${i} = ${rt('it')}(${E(n.right, sc)}), 0;\n${loopDecl(loop)}while ${i} < ${a}.length do\n${text}\nend;\nend;`;
      }
      case 'ForInStatement': {
        const loop = { id: ++tmp };
        const inner = new Scope(sc, 'block');
        const nm = n.left.type === 'VariableDeclaration' ? n.left.declarations[0].id.name : n.left.name;
        if (n.left.type === 'VariableDeclaration') inner.declare(nm, {});
        const k = T();
        const text = loopBody(n.body, inner, loop, n.left.type === 'VariableDeclaration' ? `local ${lname(nm)} = ${k};\n` : `${memberTarget(n.left, sc)} = ${k};\n`);
        return `${loopDecl(loop)}for ${k} in ${rt('pairs')}(${E(n.right, sc)}) do\n${text}\nend;`;
      }
      case 'BreakStatement': {
        const loop = loops[loops.length - 1];
        if (!loop) fail(n, 'break outside a loop');
        if (loop.switchRepeat) return 'do break end;';
        if (loop.wrapped || loop.switchDepth) { loop.usesBreak = true; return `do __b${loop.id} = true; break end;`; }
        return 'do break end;';
      }
      case 'ContinueStatement': {
        const loop = loops[loops.length - 1];
        if (!loop || loop.switchRepeat) fail(n, 'continue inside a switch is not supported');
        return 'do break end;';
      }
      case 'SwitchStatement': return switchStmt(n, sc);
      case 'ThrowStatement': return `${rt('throw')}(${E(n.argument, sc)});`;
      case 'TryStatement': {
        if (n.finalizer) fail(n, 'finally is not supported');
        if (hasJump(n.block, 'BreakStatement') || hasJump(n.block, 'ContinueStatement')) fail(n, 'break/continue inside try is not supported');
        const ok = T(), a = T(), b = T();
        const body = block(n.block.body, new Scope(sc, 'fn'));
        const cs = new Scope(sc, 'block');
        let pre = '';
        if (n.handler?.param) { cs.declare(n.handler.param.name, {}); pre = `local ${lname(n.handler.param.name)} = ${rt('caught')}(${a});\n`; }
        const handler = n.handler ? block(n.handler.body.body, cs) : '';
        // inside the protected call a `return x` becomes `return true, x`
        const marked = body.replace(/do return (.*?) end;/gs, (m, v) => `do return true, ${v} end;`).replace(/do return end;/g, 'do return true end;');
        return `do\nlocal ${ok}, ${a}, ${b} = ${rt('pcall')}(function()\n${marked}\nend);\nif ${ok} then\nif ${a} then do return ${b} end; end;\nelse\n${pre}${handler}\nend;\nend;`;
      }
    }
    fail(n, `statement ${n.type}`);
  }
  const sub = (n, sc) => n.type === 'BlockStatement' ? block(n.body, new Scope(sc, 'block')) : block([n], new Scope(sc, 'block'));

  function switchStmt(n, sc) {
    const v = T();
    // each case must end in break/return/throw/continue, or be empty (falling into the next label)
    const groups = [];
    let labels = [];
    for (const c of n.cases) {
      labels.push(c.test);
      if (!c.consequent.length) continue;
      let body = c.consequent;
      if (body.length === 1 && body[0].type === 'BlockStatement') body = body[0].body;
      const last = body[body.length - 1];
      const ends = last && ['BreakStatement', 'ReturnStatement', 'ThrowStatement', 'ContinueStatement'].includes(last.type);
      if (!ends && c !== n.cases[n.cases.length - 1]) fail(c, 'switch case falls through into code');
      groups.push({ labels, body: last?.type === 'BreakStatement' ? body.slice(0, -1) : body });
      labels = [];
    }
    // a break anywhere but the end of a case needs a real loop to break out of
    const inner = groups.some(g => g.body.some(s => hasJump(s, 'BreakStatement')));
    const loop = loops[loops.length - 1];
    let saved;
    if (inner) { loops.push({ id: ++tmp, switchRepeat: true }); }
    else if (loop) { saved = loop.switchDepth; loop.switchDepth = (loop.switchDepth || 0); }
    let out = `local ${v} = ${E(n.discriminant, sc)};\n`;
    let first = true, dflt = null;
    for (const g of groups) {
      const text = block(g.body, new Scope(sc, 'block'));
      if (g.labels.includes(null)) { dflt = text; if (g.labels.length === 1) continue; }
      const test = g.labels.filter(Boolean).map(l => `${v} == ${E(l, sc)}`).join(' or ');
      out += `${first ? 'if' : 'elseif'} ${test} then\n${text}\n`;
      first = false;
    }
    if (dflt != null) out += first ? `do\n${dflt}\nend;` : `else\n${dflt}\nend;`;
    else if (!first) out += 'end;';
    if (inner) { loops.pop(); return `repeat\n${out}\nuntil true;`; }
    if (loop) loop.switchDepth = saved;
    return `do\n${out}\nend;`;
  }

  // ------------------------------------------------------------------------------------------------ the module

  const fns = [], rest = [];
  for (const st0 of ast.body) {
    if (st0.type === 'ImportDeclaration') continue;
    if (st0.type === 'ExportNamedDeclaration' && !st0.declaration) continue;   // export { a, b }: everything top-level is on M already
    if (st0.type === 'ExportDefaultDeclaration') {
      if (st0.declaration.type === 'FunctionDeclaration') fail(st0, 'export default function');
      rest.push(`M.default = ${E(st0.declaration, modScope)};`);
      continue;
    }
    const st = topDecl(st0);
    if (st.type === 'FunctionDeclaration') {
      const nm = st.id.name;
      if (overrides[nm] != null) { fns.push(`-- ${nm}: replaced by the build\n${overrides[nm]}`); continue; }
      fns.push(`-- ${name}:${st.loc.start.line}\n${prop('M', nm)} = ${fnExpr(st, modScope)};`);
    } else if (st.type === 'VariableDeclaration') {
      const names = st.declarations.flatMap(d => patNames(d.id));
      const ov = names.find(nm => overrides[nm] != null);
      if (ov) { rest.push(`-- ${ov}: replaced by the build\n${overrides[ov]}`); continue; }
      rest.push(`-- ${name}:${st.loc.start.line}\n${declare(st, modScope, new Set())}`);
    } else {
      rest.push(`do\n${S(st, new Scope(modScope, 'block'))}\nend;`);
    }
  }

  const RT_ALIAS = { __proto__: null, type: 'type', pairs: 'pairs', pcall: 'pcall' };
  const head = [`-- Generated from the-endgame-is-me/js/${name}.js by tools/build.mjs. Do not edit; edit the game and rebuild.`,
    'local ADDON, ns = ...;', 'local RT = ns.RT;', `local M = RT.module(${q(name)});`];
  for (const [mod, alias] of imports) head.push(`local ${alias} = RT.module(${q(mod)});`);
  const helpers = [...used].sort();
  if (helpers.length > 150) throw new Error(`${name}: too many runtime helpers for one chunk`);
  if (helpers.length) head.push(`local ${helpers.map(h => '__' + h).join(', ')} = ${helpers.map(h => RT_ALIAS[h] || (h === 'orv' ? 'RT.orv' : `RT[${q(h)}]`)).join(', ')};`);
  const ms = [...mathUsed].sort();
  if (nanUsed) head.push('local __NaN = 0 / 0;');
  if (ms.length) head.push(`local ${ms.map(m => '__m' + m).join(', ')} = ${ms.map(m => 'math.' + m).join(', ')};`);
  return { lua: [...head, '', ...fns, '', ...rest, ''].join('\n'), fnTypes };
}
