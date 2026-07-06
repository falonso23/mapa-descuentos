// Cuando varios locales geocodifican al mismo punto (ej. varios comercios de un shopping,
// todos resueltos a la dirección del edificio), los pines quedan apilados exactamente uno
// sobre otro y sólo se puede clickear el de arriba. En vez de agruparlos en una burbuja con
// número (clustering, que no queremos), se reparte cada uno en un offset de píxeles fijo
// (independiente del zoom) siguiendo una espiral de Fermat/ángulo dorado: da una separación
// pareja entre puntos con una huella total que crece en sqrt(n), no en n.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const RING_SPACING_PX = 15;

export function spiralOffset(indexInGroup: number): [number, number] {
  if (indexInGroup === 0) return [0, 0];
  const radius = RING_SPACING_PX * Math.sqrt(indexInGroup);
  const angle = indexInGroup * GOLDEN_ANGLE;
  return [radius * Math.cos(angle), radius * Math.sin(angle)];
}

// Agrupa por coordenada redondeada a ~1m de precisión: alcanza para detectar "mismo edificio"
// sin confundir locales que están genuinamente en veredas opuestas.
export function coordGroupKey(lat: number, lng: number): string {
  return `${lat.toFixed(5)},${lng.toFixed(5)}`;
}
