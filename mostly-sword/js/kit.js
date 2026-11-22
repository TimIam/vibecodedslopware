import { coverageFor } from './contact.js';

export async function loadKit(loader) {
  return (await loader.loadAsync(new URL('../assets/kit.glb', import.meta.url).href)).scene;
}

// The plate and padded models were sculpted around the same Blender pivots.
// Swap only the mesh below each joint so armor follows hurt poses and grapples.
export function attachKit(rig, kit, playerIndex) {
  const panels = [];
  const tinted = new Map();
  for (const name of [
    'Hips',
    'Chest',
    'Head',
    ...['R', 'L'].flatMap((side) =>
      ['UpperArm', 'Forearm', 'Hand', 'Thigh', 'Shin'].map((part) => part + side)
    )
  ]) {
    const plate = rig[name].getObjectByName(name + '_mesh');
    const cloth = kit.getObjectByName('Padded' + name + '_mesh').clone(true);
    cloth.traverse((mesh) => {
      if (!mesh.isMesh) return;
      mesh.castShadow = mesh.receiveShadow = true;
      if (mesh.material.name !== 'Tabard') return;
      if (!tinted.has(mesh.material)) {
        const tabard = mesh.material.clone();
        tabard.color.set(playerIndex ? 0x963d33 : 0x527956);
        tinted.set(mesh.material, tabard);
      }
      mesh.material = tinted.get(mesh.material);
    });
    rig[name].add(cloth);
    panels.push({ name, plate, cloth });
  }
  let lastLevel = -1;
  return (level) => {
    if (lastLevel === level) return;
    for (const { name, plate, cloth } of panels) {
      plate.visible = coverageFor(level, name) === 'plate';
      cloth.visible = !plate.visible;
    }
    lastLevel = level;
  };
}
