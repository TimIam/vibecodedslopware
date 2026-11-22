import { advance, STEP } from './arena.js';

// Reconcile just the local fighter. HP, contacts, grapples and equipment always
// come from a host snapshot. No speculative hit can affect the opponent.
export function guestPrediction() {
  let ticks = 0,
    carry = 0,
    pending = [],
    model = null;
  function apply(command) {
    const p = model.p[1],
      other = model.p[0];
    if (
      model.winner >= 0 ||
      p.down ||
      p.recovery ||
      p.stun ||
      p.bind ||
      p.gripL ||
      p.gripR ||
      other.gripL ||
      other.gripR
    )
      return;
    advance(model, 1, command, STEP);
    const dx = p.x - other.x,
      dz = p.z - other.z,
      d = Math.hypot(dx, dz);
    if (d > 0 && d < 0.64) {
      p.x = other.x + (dx * 0.64) / d;
      p.z = other.z + (dz * 0.64) / d;
    }
  }
  return {
    get fighter() {
      return model?.p[1];
    },
    accept(state) {
      model = { ...state, p: [state.p[0], { ...state.p[1] }] };
      pending = pending.filter((item) => item.tick > state.inputAck);
      for (const item of pending) apply(item.command);
    },
    step(command, dt) {
      if (!model) return ticks;
      carry += Math.min(dt, 0.09);
      const sampled = { ...command };
      while (carry + 1e-9 >= STEP) {
        pending.push({ tick: ++ticks, command: sampled });
        if (pending.length > 20) pending.shift();
        apply(sampled);
        carry = Math.max(0, carry - STEP);
      }
      return ticks;
    }
  };
}
