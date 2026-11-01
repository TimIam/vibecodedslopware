// Late-bound cross-module functions (breaks circular imports between the ported modules).
// Each module registers its implementations with `register({...})` at load time.

const warned = new Set();
function missing(name) {
  return (...args) => {
    if (!warned.has(name)) { warned.add(name); console.warn('[port] not yet implemented:', name); }
    return undefined;
  };
}

export const Hooks = new Proxy({}, {
  get(target, name) {
    if (name in target) return target[name];
    return missing(String(name));
  },
});

const real = {};
export function register(fns) { Object.assign(Hooks, fns); Object.assign(real, fns); }
export const hasHook = (name) => name in real;
