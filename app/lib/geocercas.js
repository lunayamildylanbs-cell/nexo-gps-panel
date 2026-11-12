export function crearCirculo(latitud, longitud, radio) {
  const coordenadas = [];
  const pasos = 64;
  const radioTierra = 6371000;

  const lat = Number(latitud) * Math.PI / 180;
  const lon = Number(longitud) * Math.PI / 180;
  const distancia = Number(radio) / radioTierra;

  for (let i = 0; i <= pasos; i++) {
    const angulo = (2 * Math.PI * i) / pasos;

    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(distancia) +
      Math.cos(lat) * Math.sin(distancia) * Math.cos(angulo)
    );

    const lon2 = lon + Math.atan2(
      Math.sin(angulo) * Math.sin(distancia) * Math.cos(lat),
      Math.cos(distancia) - Math.sin(lat) * Math.sin(lat2)
    );

    coordenadas.push([
      lon2 * 180 / Math.PI,
      lat2 * 180 / Math.PI,
    ]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordenadas],
    },
  };
}

export function cerrarAnillo(coordenadas) {
  if (!Array.isArray(coordenadas) || coordenadas.length < 3) {
    return [];
  }

  const puntos = coordenadas.map((p) => [
    Number(p[0]),
    Number(p[1]),
  ]);

  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];

  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
    puntos.push([...primero]);
  }

  return puntos;
}

export function crearRectangulo(a, b) {
  const minLon = Math.min(Number(a[0]), Number(b[0]));
  const maxLon = Math.max(Number(a[0]), Number(b[0]));
  const minLat = Math.min(Number(a[1]), Number(b[1]));
  const maxLat = Math.max(Number(a[1]), Number(b[1]));

  return {
    type: 'Polygon',
    coordinates: [[
      [minLon, minLat],
      [maxLon, minLat],
      [maxLon, maxLat],
      [minLon, maxLat],
      [minLon, minLat],
    ]],
  };
}

export function obtenerGeometriaGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') {
    if (
      !Number.isFinite(Number(geocerca.latitud)) ||
      !Number.isFinite(Number(geocerca.longitud)) ||
      Number(geocerca.radio_m) <= 0
    ) {
      return null;
    }

    return crearCirculo(
      geocerca.latitud,
      geocerca.longitud,
      geocerca.radio_m
    ).geometry;
  }

  const geometria = geocerca.geometria;

  if (
    !geometria ||
    !['Polygon', 'LineString'].includes(geometria.type)
  ) {
    return null;
  }

  return geometria;
}

export function obtenerPuntosGeocerca(geocerca) {
  const geometria = obtenerGeometriaGeocerca(geocerca);

  if (!geometria) return [];

  if (geometria.type === 'LineString') {
    return geometria.coordinates ?? [];
  }

  if (geometria.type === 'Polygon') {
    return geometria.coordinates?.[0] ?? [];
  }

  return [];
}

export function distanciaMetros(a, b) {
  const radioTierra = 6371000;

  const lat1 = Number(a[1]) * Math.PI / 180;
  const lat2 = Number(b[1]) * Math.PI / 180;

  const deltaLat = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
  const deltaLon = (Number(b[0]) - Number(a[0])) * Math.PI / 180;

  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) *
    Math.cos(lat2) *
    Math.sin(deltaLon / 2) ** 2;

  return 2 * radioTierra * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function etiquetaTipoGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') return 'Círculo';
  if (geocerca.tipo === 'linea') return 'Línea';

  if (
    geocerca.geometria?.forma === 'rectangulo' ||
    geocerca.geometria?.properties?.forma === 'rectangulo'
  ) {
    return 'Rectángulo';
  }

  return 'Polígono';
}