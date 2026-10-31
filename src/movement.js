// Accept numerical round-off at tangency, not a visible overlap (one nanometre).
const CONTACT_EPSILON = 1e-9;

/** Shared collision envelope for input and regression checks; broken props no longer obstruct. */
export function canOccupy(state, x, z, radius = 0.22) {
  const b = state.layout.bounds;
  if (!Number.isFinite(x) || !Number.isFinite(z) || x < b.minX + radius - CONTACT_EPSILON || x > b.maxX - radius + CONTACT_EPSILON || z < b.minZ + radius - CONTACT_EPSILON || z > b.maxZ - radius + CONTACT_EPSILON) return false;
  return ![...state.layout.walls, ...state.props.filter(prop => !prop.broken)].some(box =>
    Math.abs(x - box.x) < box.width / 2 + radius - CONTACT_EPSILON &&
    Math.abs(z - box.z) < box.depth / 2 + radius - CONTACT_EPSILON);
}
