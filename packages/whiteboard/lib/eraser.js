/** Hit-test complete pen strokes against an eraser swept in board coordinates. */
export function pointSegmentDistance2(point, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t = length2 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / length2)) : 0;
  return (point.x - a.x - t * dx) ** 2 + (point.y - a.y - t * dy) ** 2;
}

export function segmentsNear(a, b, c, d, radius) {
  const cross = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const intersects = Math.max(a.x, b.x) >= Math.min(c.x, d.x) && Math.max(c.x, d.x) >= Math.min(a.x, b.x)
    && Math.max(a.y, b.y) >= Math.min(c.y, d.y) && Math.max(c.y, d.y) >= Math.min(a.y, b.y)
    && cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
  return intersects || Math.min(pointSegmentDistance2(a, c, d), pointSegmentDistance2(b, c, d),
    pointSegmentDistance2(c, a, b), pointSegmentDistance2(d, a, b)) <= radius * radius;
}

export function strokeHitsEraser(item, from, to, radius) {
  if (item.kind !== 'ink' || !Array.isArray(item.points)) return false;
  const points = item.points.map(([x, y]) => ({ x: item.x + x, y: item.y + y }));
  return points.some((point, i) => segmentsNear(from, to, points[Math.max(0, i - 1)], point, radius));
}
