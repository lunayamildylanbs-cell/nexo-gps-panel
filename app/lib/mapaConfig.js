export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const INTERVALO_ACTUALIZACION = 5000;
export const ESTILO_CLARO = 'mapbox://styles/mapbox/streets-v12';
export const ESTILO_OSCURO = 'mapbox://styles/mapbox/dark-v11';

export function agregarCapasMapa(mapa) {
  // 1. Capa para el recorrido punteado del dispositivo seleccionado
  if (!mapa.getSource('recorrido-dispositivo')) {
    mapa.addSource('recorrido-dispositivo', {
      type: 'geojson',
      data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } },
    });
  }
  if (!mapa.getLayer('recorrido-dispositivo-linea')) {
    mapa.addLayer({
      id: 'recorrido-dispositivo-linea',
      type: 'line',
      source: 'recorrido-dispositivo',
      paint: {
        'line-color': '#2563eb',
        'line-width': 3,
        'line-dasharray': [2, 2], // Línea punteada
        'line-opacity': 0.85,
      },
    });
  }

  // 2. Geocercas (Polígonos, Rectángulos y Círculos)
  if (!mapa.getSource('geocercas')) {
    mapa.addSource('geocercas', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!mapa.getLayer('geocercas-relleno')) {
    mapa.addLayer({
      id: 'geocercas-relleno',
      type: 'fill',
      source: 'geocercas',
      paint: {
        'fill-color': [
          'case',
          ['==', ['get', 'activa'], true],
          '#16a34a',
          '#94a3b8',
        ],
        'fill-opacity': 0.16,
      },
    });
  }
  if (!mapa.getLayer('geocercas-borde')) {
    mapa.addLayer({
      id: 'geocercas-borde',
      type: 'line',
      source: 'geocercas',
      paint: {
        'line-color': [
          'case',
          ['==', ['get', 'activa'], true],
          '#15803d',
          '#64748b',
        ],
        'line-width': 2,
      },
    });
  }

  // 3. Dispositivos (Puntos y Nombres)
  if (!mapa.getSource('dispositivos')) {
    mapa.addSource('dispositivos', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!mapa.getLayer('dispositivos-puntos')) {
    mapa.addLayer({
      id: 'dispositivos-puntos',
      type: 'circle',
      source: 'dispositivos',
      paint: {
        'circle-radius': 8,
        'circle-color': [
          'case',
          ['==', ['get', 'activo'], true],
          '#2563eb',
          '#94a3b8',
        ],
        'circle-stroke-width': 2,
        'circle-stroke-color': '#ffffff',
      },
    });
  }
  if (!mapa.getLayer('dispositivos-etiquetas')) {
    mapa.addLayer({
      id: 'dispositivos-etiquetas',
      type: 'symbol',
      source: 'dispositivos',
      layout: {
        'text-field': ['get', 'nombre'],
        'text-size': 12,
        'text-offset': [0, 1.3],
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': '#172554',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1.5,
      },
    });
  }

  // 4. Capas del borrador de dibujo interactivo
  if (!mapa.getSource('geocerca-borrador')) {
    mapa.addSource('geocerca-borrador', {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  }
  if (!mapa.getLayer('geocerca-borrador-relleno')) {
    mapa.addLayer({
      id: 'geocerca-borrador-relleno',
      type: 'fill',
      source: 'geocerca-borrador',
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 },
    });
  }
  if (!mapa.getLayer('geocerca-borrador-linea')) {
    mapa.addLayer({
      id: 'geocerca-borrador-linea',
      type: 'line',
      source: 'geocerca-borrador',
      paint: {
        'line-color': '#2563eb',
        'line-width': 3,
        'line-dasharray': [2, 1],
      },
    });
  }
  if (!mapa.getLayer('geocerca-borrador-vertices')) {
    mapa.addLayer({
      id: 'geocerca-borrador-vertices',
      type: 'circle',
      source: 'geocerca-borrador',
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': '#1d4ed8',
        'circle-stroke-width': 2,
      },
    });
  }
}