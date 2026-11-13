// Courbe arrondie (cubique monotone) : douce, sans bosse au-delà des vraies valeurs. Partagée par tous les graphiques.
export function lisse(pts: [number, number][]) {
  const n = pts.length;
  if (n < 3) return pts.map(([px, py], i) => `${i ? "L" : "M"}${px},${py}`).join(" ");
  const m = pts.slice(0, -1).map(([x0, y0], i) => (pts[i + 1][1] - y0) / (pts[i + 1][0] - x0));
  const t = pts.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) (t[i] = (3 / Math.sqrt(s)) * a * m[i]), (t[i + 1] = (3 / Math.sqrt(s)) * b * m[i]);
  }
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const h = (x1 - x0) / 3;
    d += ` C${x0 + h},${y0 + t[i] * h} ${x1 - h},${y1 - t[i + 1] * h} ${x1},${y1}`;
  }
  return d;
}
