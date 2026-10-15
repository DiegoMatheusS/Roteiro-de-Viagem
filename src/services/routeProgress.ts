/** Divide a linha rodoviária em trechos percorridos e a percorrer.
 * Considera tanto o GPS como a distância realizada: em rotas circulares,
 * o começo e o fim podem estar no mesmo lugar.
 */
export function splitRouteAtPosition(
  path: [number, number][],
  location?: [number, number],
  travelledKm = 0,
  totalKm = 0
): { travelled: [number, number][]; remaining: [number, number][] } {
  if (path.length < 2 || !location) return { travelled: [], remaining: path };
  const latitudeFactor = Math.max(0.1, Math.cos(location[0] * Math.PI / 180));
  const progress = totalKm > 0 ? Math.min(1, Math.max(0, travelledKm / totalKm)) : 0;
  let nearest = 0, metric = Infinity, directDistance = Infinity;
  path.forEach((point, index) => {
    const dy = (point[0] - location[0]) * 111;
    const dx = (point[1] - location[1]) * 111 * latitudeFactor;
    const distance = Math.hypot(dx, dy);
    // Em cruzamentos, prefere o ponto compatível com o avanço registrado no GPS.
    const score = distance + Math.abs(index / (path.length - 1) - progress) * 0.15;
    if (score < metric) { metric = score; nearest = index; directDistance = distance; }
  });
  // Se o motorista estiver longe do trajeto, não declarar nenhum segmento como concluído.
  if (directDistance > 1.5) return { travelled: [], remaining: path };
  return { travelled: path.slice(0, nearest + 1), remaining: path.slice(nearest) };
}
