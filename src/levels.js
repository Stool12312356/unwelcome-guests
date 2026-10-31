// Level generator: three prefab rooms (template + mirror + palette) joined by doors at varying offsets.
// Pure data, deterministic from the supplied random(). Distances in metres; +z is the south wall.
export const PROP_KINDS = Object.freeze({
  tv: { width: 1.5, height: 1.05, depth: 0.65, valueRub: 48000, hp: 70 },
  vase: { width: 0.55, height: 0.95, depth: 0.55, valueRub: 9500, hp: 25 },
  aquarium: { width: 1.5, height: 1.3, depth: 0.75, valueRub: 36000, hp: 60 },
  chair: { width: 0.7, height: 1.05, depth: 0.7, valueRub: 4200, hp: 65 },
  table: { width: 1.6, height: 0.8, depth: 1.1, valueRub: 18000, hp: 100 },
  box: { width: 0.85, height: 0.75, depth: 0.85, valueRub: 1200, hp: 45 },
  sofa: { width: 2.65, height: 1.05, depth: 1.15, valueRub: 28000, hp: 160 },
  cabinet: { width: 1.65, height: 1.65, depth: 0.85, valueRub: 22000, hp: 140 },
});

export const DOOR_WIDTH = 2.4;
export const DOOR_OFFSETS = Object.freeze([-0.6, 0, 0.6]);
/** Free band along the apartment axis: no furniture inside |z| < LANE, so doors always connect. */
export const LANE = 2;
const WINDOW_HALF = 1.5; // tall furniture may not sit in front of the north window
const WINDOW_SILL = 1.06;
const H = Math.PI / 2;

// [kind, local x from room centre, z, yaw]. yaw 0 faces +z, PI faces -z, +-PI/2 face +-x.
export const ROOM_TEMPLATES = Object.freeze([
  { id: 'living', label: 'Гостиная', props: [
    ['sofa', -0.8, 5.2, Math.PI], ['cabinet', 2.0, 5.45, Math.PI], ['tv', -1.7, -5.4, 0],
    ['table', 1.9, -3.2, 0], ['vase', -2.4, -3.0, 0]] },
  { id: 'dining', label: 'Столовая', props: [
    ['table', 0, -3.6, 0], ['chair', -1.35, -3.6, H], ['chair', 1.35, -3.6, -H],
    ['cabinet', -2.0, 5.45, Math.PI], ['box', 2.0, 5.2, Math.PI]] },
  { id: 'storage', label: 'Кладовая', props: [
    ['box', -2.2, -5.3, 0], ['box', -1.3, -5.3, 0], ['cabinet', -2.0, 5.45, Math.PI],
    ['cabinet', 0, 5.45, Math.PI], ['box', 2.1, 5.3, Math.PI]] },
  { id: 'aquarium', label: 'Комната с аквариумом', props: [
    ['aquarium', 2.05, -5.35, 0], ['vase', -2.3, -5.3, 0], ['tv', -1.9, 5.45, Math.PI],
    ['table', 1.5, 5.0, Math.PI], ['chair', 0, 4.8, Math.PI]] },
  { id: 'study', label: 'Кабинет', props: [
    ['sofa', 1.4, -5.2, 0], ['table', -1.9, -3.4, 0], ['cabinet', -2.0, 5.45, Math.PI],
    ['box', 0.3, 5.3, Math.PI], ['vase', 2.3, 5.3, Math.PI]] },
]);

// Wall/floor tints (hex). Plaster and floor textures are multiplied by these colours.
export const PALETTES = Object.freeze([
  { id: 'sand', wall: 0xc0af94, floor: 0xc1ac90 },
  { id: 'sage', wall: 0x929f99, floor: 0xa5ada8 },
  { id: 'rose', wall: 0xa59891, floor: 0xb59f88 },
  { id: 'slate', wall: 0x8997a3, floor: 0xa39a8c },
  { id: 'olive', wall: 0x9ca28a, floor: 0xb8a98a },
]);

const shuffle = (list, random) => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Partition at x with a door centred on z = centre; returns the two wall pieces (north, south). */
function partition(x, centre) {
  const lo = centre - DOOR_WIDTH / 2, hi = centre + DOOR_WIDTH / 2;
  return [
    { id: `partition-${x}--1`, x, z: (-6 + lo) / 2, width: 0.2, depth: lo + 6, height: 3 },
    { id: `partition-${x}-1`, x, z: (hi + 6) / 2, width: 0.2, depth: 6 - hi, height: 3 },
  ];
}

export function generateLevel(random) {
  const doorZ = [0, 1].map(() => DOOR_OFFSETS[Math.floor(random() * DOOR_OFFSETS.length)]);
  const templates = shuffle(ROOM_TEMPLATES, random).slice(0, 3);
  const mirrors = [0, 1, 2].map(() => random() < 0.5);
  const palettes = shuffle(PALETTES, random).slice(0, 3);
  const walls = [
    { id: 'north', x: 0, z: -6, width: 18.2, depth: 0.2, height: 3 },
    { id: 'south', x: 0, z: 6, width: 18.2, depth: 0.2, height: 3 },
    { id: 'west', x: -9, z: 0, width: 0.2, depth: 12, height: 3 },
    { id: 'east', x: 9, z: 0, width: 0.2, depth: 12, height: 3 },
    ...partition(-3, doorZ[0]), ...partition(3, doorZ[1]),
  ];
  const doors = [-3, 3].map((x, i) => ({ x, z: doorZ[i], width: DOOR_WIDTH }));
  const rooms = templates.map((template, index) => ({
    index, x: -6 + index * 6, templateId: template.id, label: template.label,
    mirrored: mirrors[index], wall: palettes[index].wall, floor: palettes[index].floor,
  }));
  const props = [];
  rooms.forEach((room, index) => {
    for (const [kind, lx, z, rawYaw] of templates[index].props) {
      const base = PROP_KINDS[kind];
      const yaw = room.mirrored && Math.abs(Math.sin(rawYaw)) > 0.5 ? -rawYaw : rawYaw;
      const turned = Math.abs(Math.sin(yaw)) > 0.5;
      const height = base.height;
      props.push({
        id: `prop-${props.length + 1}`, kind, yaw,
        x: room.x + (room.mirrored ? -lx : lx), y: height / 2, z,
        width: turned ? base.depth : base.width, height, depth: turned ? base.width : base.depth,
        valueRub: base.valueRub, hp: base.hp, broken: false,
      });
    }
  });
  const layout = {
    bounds: { minX: -9, maxX: 9, minZ: -6, maxZ: 6 }, walls, doors, rooms,
    spawn: { x: -7, y: 1.65, z: 0 },
    variant: rooms.map(r => `${r.templateId}${r.mirrored ? '~' : ''}`).join('|'),
  };
  return { layout, props };
}

/** Returns human-readable problems; an empty list means the level is playable. */
export function validateLevel({ layout, props }) {
  const problems = [];
  const eps = 1e-9;
  props.forEach((a, i) => {
    const room = layout.rooms.find(r => Math.abs(a.x - r.x) < 3);
    if (!room) { problems.push(`${a.id}: вне комнат`); return; }
    if (a.x - a.width / 2 < room.x - 2.85 - eps || a.x + a.width / 2 > room.x + 2.85 + eps) problems.push(`${a.id}: пересекает перегородку`);
    if (a.z - a.depth / 2 < -5.9 - eps || a.z + a.depth / 2 > 5.9 + eps) problems.push(`${a.id}: вне стены`);
    if (Math.abs(a.z) - a.depth / 2 < LANE - eps) problems.push(`${a.id}: перекрывает проход`);
    if (a.z < 0 && a.height > WINDOW_SILL && Math.abs(a.x - room.x) - a.width / 2 < WINDOW_HALF - 0.4) problems.push(`${a.id}: закрывает окно`);
    for (const b of props.slice(i + 1)) {
      if (Math.abs(a.x - b.x) < (a.width + b.width) / 2 && Math.abs(a.z - b.z) < (a.depth + b.depth) / 2) problems.push(`${a.id} пересекает ${b.id}`);
    }
  });
  for (const wall of layout.walls) {
    for (const a of props) {
      if (Math.abs(a.x - wall.x) < (a.width + wall.width) / 2 && Math.abs(a.z - wall.z) < (a.depth + wall.depth) / 2) problems.push(`${a.id} в стене ${wall.id}`);
    }
  }
  return problems;
}
