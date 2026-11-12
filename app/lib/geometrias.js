export function crearCirculo(latitud, longitud, radio) {
  const coordenadas = [];
  const pasos = 64;
  const radioTierra = 6371000;
  const lat = (Number(latitud) * Math.PI) / 180;
  const lon = (Number(longitud) * Math.PI) / 180;
  const distancia = Number(radio) / radioTierra;

  for (let i = 0; i <= pasos; i++) {
    const angulo = (2 * Math.PI * i) / pasos;
    const lat2 = Math.asin(
      Math.sin(lat) * Math.cos(distancia) +
        Math.cos(lat) * Math.sin(distancia) * Math.cos(angulo)
    );
    const lon2 =
      lon +
      Math.atan2(
        Math.sin(angulo) * Math.sin(distancia) * Math.cos(lat),
        Math.cos(distancia) - Math.sin(lat) * Math.sin(lat2)
      );
    coordenadas.push([(lon2 * 180) / Math.PI, (lat2 * 180) / Math.PI]);
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
  if (!Array.isArray(coordenadas) || coordenadas.length < 3) return [];
  const puntos = coordenadas.map((p) => [Number(p[0]), Number(p[1])]);
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
    coordinates: [
      [
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat],
        [minLon, maxLat],
        [minLon, minLat],
      ],
    ],
  };
}

export function distanciaMetros(a, b) {
  const radioTierra = 6371000;
  const lat1 = (Number(a[1]) * Math.PI) / 180;
  const lat2 = (Number(b[1]) * Math.PI) / 180;
  const deltaLat = ((Number(b[1]) - Number(a[1])) * Math.PI) / 180;
  const deltaLon = ((Number(b[0]) - Number(a[0])) * Math.PI) / 180;
  const h =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radioTierra * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function puntoEnPoligonoJS(lat, lon, coordenadas) {
  if (!Array.isArray(coordenadas) || coordenadas.length < 3) return false;
  let dentro = false;
  for (let i = 0, j = coordenadas.length - 1; i < coordenadas.length; j = i++) {
    const xi = Number(coordenadas[i][0]);
    const yi = Number(coordenadas[i][1]);
    const xj = Number(coordenadas[j][0]);
    const yj = Number(coordenadas[j][1]);
    const intersecta =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersecta) dentro = !dentro;
  }
  return dentro;
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
    return crearCirculo(geocerca.latitud, geocerca.longitud, geocerca.radio_m).geometry;
  }

  const geometria = geocerca.geometria;
  if (!geometria || !['Polygon', 'LineString'].includes(geometria.type)) return null;
  return geometria;
}

export function obtenerPuntosGeocerca(geocerca) {
  const geometria = obtenerGeometriaGeocerca(geocerca);
  if (!geometria) return [];
  if (geometria.type === 'LineString') return geometria.coordinates ?? [];
  if (geometria.type === 'Polygon') return geometria.coordinates?.[0] ?? [];
  return [];
}

export function etiquetaTipoGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') return 'Círculo';
  if (geocerca.tipo === 'linea') return 'Línea / Calle';
  if (
    geocerca.geometria?.forma === 'rectangulo' ||
    geocerca.geometria?.properties?.forma === 'rectangulo'
  ) {
    return 'Rectángulo';
  }
  return 'Polígono / Cuadra';
}

// Calcula dimensiones (Radio, Área, Perímetro o Longitud) de cualquier figura
export function calcularDimensionesGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') {
    const r = Number(geocerca.radio_m) || 0;
    const area = Math.PI * r * r;
    const perimetro = 2 * Math.PI * r;
    return {
      radio: `${r} m`,
      perimetro: `${Math.round(perimetro)} m`,
      area: area >= 10000 ? `${(area / 10000).toFixed(2)} ha` : `${Math.round(area)} m²`,
    };
  }

  const puntos = obtenerPuntosGeocerca(geocerca);
  if (puntos.length < 2) return { detalle: 'Sin dimensiones' };

  let perimetroTotal = 0;
  for (let i = 0; i < puntos.length - 1; i++) {
    perimetroTotal += distanciaMetros(puntos[i], puntos[i + 1]);
  }

  if (geocerca.tipo === 'linea') {
    return { longitud: `${Math.round(perimetroTotal)} m` };
  }

  // Si es polígono cerrado, sumar el último segmento al primero
  perimetroTotal += distanciaMetros(puntos[puntos.length - 1], puntos[0]);

  // Área por aproximación planar (Shoelace proyectado)
  const cLat = Number(geocerca.latitud) || puntos[0][1];
  const cLon = Number(geocerca.longitud) || puntos[0][0];
  const kx = Math.cos((cLat * Math.PI) / 180) * 111320;
  const ky = 110540;

  let areaAprox = 0;
  for (let i = 0; i < puntos.length; i++) {
    const j = (i + 1) % puntos.length;
    const xi = (puntos[i][0] - cLon) * kx;
    const yi = (puntos[i][1] - cLat) * ky;
    const xj = (puntos[j][0] - cLon) * kx;
    const yj = (puntos[j][1] - cLat) * ky;
    areaAprox += xi * yj - xj * yi;
  }
  areaAprox = Math.abs(areaAprox) / 2;

  return {
    perimetro: `${Math.round(perimetroTotal)} m`,
    area: areaAprox >= 10000 ? `${(areaAprox / 10000).toFixed(2)} ha` : `${Math.round(areaAprox)} m²`,
  };
}

// Determina todas las geocercas activas que contienen a una ubicación (lat, lon)
export function geocercasQueContienenPunto(lat, lon, listaGeocercas) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon))) return [];

  return listaGeocercas.filter((geo) => {
    if (!geo.activa) return false;
    if (geo.tipo === 'circulo') {
      const d = distanciaMetros([lon, lat], [geo.longitud, geo.latitud]);
      return d <= (Number(geo.radio_m) || 100);
    }
    if (geo.tipo === 'poligono' || geo.tipo === 'rectangulo') {
      const puntos = obtenerPuntosGeocerca(geo);
      return puntoEnPoligonoJS(lat, lon, puntos);
    }
    return false; // Las líneas son trayectos, no áreas que contienen
  });
}