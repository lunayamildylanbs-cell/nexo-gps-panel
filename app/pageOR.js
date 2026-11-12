'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './page.css';
import { supabase } from './lib/supabase';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const INTERVALO_ACTUALIZACION = 5000;
const ESTILO_CLARO = 'mapbox://styles/mapbox/streets-v12';
const ESTILO_OSCURO = 'mapbox://styles/mapbox/dark-v11';

function fecha(valor) {
  if (!valor) return 'Sin datos';

  const fechaValor = new Date(valor);
  if (Number.isNaN(fechaValor.getTime())) return 'Fecha inválida';

  return fechaValor.toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function horaCorta(valor) {
  if (!valor) return 'Sin actualización';

  const fechaValor = new Date(valor);
  if (Number.isNaN(fechaValor.getTime())) return 'Fecha inválida';

  return fechaValor.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function estadoSenal(ubicacion) {
  if (!ubicacion?.registrado_en) {
    return { etiqueta: 'Sin señal', detalle: 'Todavía no hay una ubicación recibida', tono: 'muted', enLinea: false };
  }

  const instante = new Date(ubicacion.registrado_en).getTime();
  if (!Number.isFinite(instante)) {
    return { etiqueta: 'Fecha inválida', detalle: 'No se puede interpretar la última ubicación', tono: 'muted', enLinea: false };
  }

  const antiguedad = Date.now() - instante;
  const enLinea = antiguedad <= 120000 && antiguedad >= -60000;

  return enLinea
    ? { etiqueta: 'En línea', detalle: 'Última ubicación: ' + horaCorta(ubicacion.registrado_en), tono: 'good', enLinea: true }
    : { etiqueta: 'Inactivo', detalle: 'Última ubicación: ' + fecha(ubicacion.registrado_en), tono: 'warning', enLinea: false };
}

function crearCirculo(latitud, longitud, radio) {
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

function cerrarAnillo(coordenadas) {
  if (!Array.isArray(coordenadas) || coordenadas.length < 3) return [];
  const puntos = coordenadas.map((p) => [Number(p[0]), Number(p[1])]);
  const primero = puntos[0];
  const ultimo = puntos[puntos.length - 1];
  if (primero[0] !== ultimo[0] || primero[1] !== ultimo[1]) {
    puntos.push([...primero]);
  }
  return puntos;
}

function crearRectangulo(a, b) {
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

function obtenerGeometriaGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') {
    if (!Number.isFinite(Number(geocerca.latitud)) ||
        !Number.isFinite(Number(geocerca.longitud)) ||
        Number(geocerca.radio_m) <= 0) return null;
    return crearCirculo(geocerca.latitud, geocerca.longitud, geocerca.radio_m).geometry;
  }

  const geometria = geocerca.geometria;
  if (!geometria || !['Polygon', 'LineString'].includes(geometria.type)) return null;
  return geometria;
}

function obtenerPuntosGeocerca(geocerca) {
  const geometria = obtenerGeometriaGeocerca(geocerca);
  if (!geometria) return [];
  if (geometria.type === 'LineString') return geometria.coordinates ?? [];
  if (geometria.type === 'Polygon') return geometria.coordinates?.[0] ?? [];
  return [];
}

function distanciaMetros(a, b) {
  const radioTierra = 6371000;
  const lat1 = Number(a[1]) * Math.PI / 180;
  const lat2 = Number(b[1]) * Math.PI / 180;
  const deltaLat = (Number(b[1]) - Number(a[1])) * Math.PI / 180;
  const deltaLon = (Number(b[0]) - Number(a[0])) * Math.PI / 180;
  const h = Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 2 * radioTierra * Math.asin(Math.sqrt(Math.min(1, h)));
}

function etiquetaTipoGeocerca(geocerca) {
  if (geocerca.tipo === 'circulo') return 'Círculo';
  if (geocerca.tipo === 'linea') return 'Línea';
  if (geocerca.geometria?.forma === 'rectangulo' || geocerca.geometria?.properties?.forma === 'rectangulo') return 'Rectángulo';
  return 'Polígono';
}

function agregarCapasMapa(mapa) {
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

function Icono({ nombre, tamano = 20 }) {
  const props = {
    width: tamano,
    height: tamano,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (nombre) {
    case 'pin':
      return (
        <svg {...props}>
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...props}>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M5.6 9A7 7 0 0 1 17.3 6L20 12M4 12l2.7 6A7 7 0 0 0 18.4 15" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      );
    case 'layers':
      return (
        <svg {...props}>
          <path d="m12 3 9 5-9 5-9-5 9-5Z" />
          <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
        </svg>
      );
    case 'device':
      return (
        <svg {...props}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M10 18h4" />
        </svg>
      );
    case 'fence':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case 'history':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5M12 7v5l3 2" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...props}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'crosshair':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case 'shape-circle':
      return <svg {...props}><circle cx="12" cy="12" r="8" /></svg>;
    case 'shape-rectangle':
      return <svg {...props}><rect x="4" y="5" width="16" height="14" rx="1" /></svg>;
    case 'shape-polygon':
      return <svg {...props}><path d="m12 3 8 6-3 11H7L4 9l8-6Z" /></svg>;
    case 'shape-line':
      return <svg {...props}><path d="M4 18 20 6" /><circle cx="4" cy="18" r="1.5" /><circle cx="20" cy="6" r="1.5" /></svg>;
    case 'close':
      return (
        <svg {...props}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}

export default function Home() {
  const mapaContenedor = useRef(null);
  const mapaRef = useRef(null);
  const mapaEstiloRef = useRef('');
  const mapaEnfocadoRef = useRef(false);
  const cargaEnCursoRef = useRef(false);
  const herramientaDibujoRef = useRef(null);
  const puntosDibujoRef = useRef([]);

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState(null);
  const [sesionLista, setSesionLista] = useState(false);
  const [verificandoRol, setVerificandoRol] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mapaListo, setMapaListo] = useState(false);
  const [tema, setTema] = useState('claro');
  const [temaCargado, setTemaCargado] = useState(false);

  const [dispositivos, setDispositivos] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');
  const [ultimaConsulta, setUltimaConsulta] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [seccionLateral, setSeccionLateral] = useState('todos');

  const [editorGeocercaAbierto, setEditorGeocercaAbierto] = useState(false);
  const [tipoGeocerca, setTipoGeocerca] = useState('circulo');
  const [nombreGeocerca, setNombreGeocerca] = useState('');
  const [descripcionGeocerca, setDescripcionGeocerca] = useState('');
  const [radioGeocerca, setRadioGeocerca] = useState('150');
  const [puntosDibujo, setPuntosDibujo] = useState([]);
  const [modoDibujo, setModoDibujo] = useState(false);
  const [dibujoFinalizado, setDibujoFinalizado] = useState(false);
  const [geocercaEditando, setGeocercaEditando] = useState(null);
  const [guardandoGeocerca, setGuardandoGeocerca] = useState(false);
  const [mensajeDibujo, setMensajeDibujo] = useState('');

  useEffect(() => {
    try {
      const temaGuardado = window.localStorage.getItem('panel-gps-tema');
      if (temaGuardado === 'oscuro' || temaGuardado === 'claro') {
        setTema(temaGuardado);
      }
    } catch {
      // El panel funciona también si el navegador bloquea localStorage.
    } finally {
      setTemaCargado(true);
    }
  }, []);

  useEffect(() => {
    if (!temaCargado) return;

    try {
      window.localStorage.setItem('panel-gps-tema', tema);
    } catch {
      // No es obligatorio poder guardar la preferencia visual.
    }
  }, [tema, temaCargado]);

  useEffect(() => {
    if (!supabase) {
      setError('Faltan las variables de conexión de Supabase en .env.local.');
      setSesionLista(true);
      return;
    }

    let vigente = true;

    supabase.auth.getSession().then(({ data, error: err }) => {
      if (!vigente) return;

      if (err) setError(err.message);
      setUsuario(data.session?.user ?? null);
      setSesionLista(true);
    });

    const { data } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      setUsuario(sesion?.user ?? null);
      setSesionLista(true);
      setError('');
    });

    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    if (!supabase || !usuario) {
      setRol(null);
      setVerificandoRol(false);
      setDispositivos([]);
      setGeocercas([]);
      setEventos([]);
      return;
    }

    async function comprobarRol() {
      setVerificandoRol(true);
      setRol(null);

      const { data, error: err } = await supabase
        .from('roles_usuarios')
        .select('rol')
        .eq('usuario_id', usuario.id)
        .maybeSingle();

      if (cancelado) return;

      if (err) {
        setError('No se pudo comprobar tu rol: ' + err.message);
        setRol('sin_verificar');
      } else {
        setRol(data?.rol ?? 'usuario');
      }

      setVerificandoRol(false);
    }

    comprobarRol();

    return () => {
      cancelado = true;
    };
  }, [usuario]);

  const cargarDatos = useCallback(async ({ silencioso = false } = {}) => {
    if (!supabase || cargaEnCursoRef.current) return;

    cargaEnCursoRef.current = true;
    if (!silencioso) {
      setCargando(true);
      setError('');
    }

    try {
      const [
        respuestaDispositivos,
        respuestaGeocercas,
        respuestaEventos,
      ] = await Promise.all([
        supabase
          .from('dispositivos')
          .select('id,nombre,descripcion,creado_en')
          .order('creado_en', { ascending: false }),

        supabase
          .from('geocercas')
          .select(
            'id,propietario_id,nombre,descripcion,latitud,longitud,radio_m,activa,tipo,geometria,creado_en'
          )
          .order('creado_en', { ascending: false }),

        supabase
          .from('eventos_geocerca')
          .select(
            'id,dispositivo_id,geocerca_id,tipo,latitud,longitud,ocurrido_en'
          )
          .order('ocurrido_en', { ascending: false })
          .limit(50),
      ]);

      if (respuestaDispositivos.error) throw respuestaDispositivos.error;
      if (respuestaGeocercas.error) throw respuestaGeocercas.error;
      if (respuestaEventos.error) throw respuestaEventos.error;

      const listaDispositivos = respuestaDispositivos.data ?? [];

      const resultadosUbicaciones = await Promise.all(
        listaDispositivos.map(async (dispositivo) => {
          const respuesta = await supabase
            .from('ubicaciones')
            .select(
              'id,dispositivo_id,latitud,longitud,precision_m,velocidad_m_s,rumbo_grados,registrado_en'
            )
            .eq('dispositivo_id', dispositivo.id)
            .order('registrado_en', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (respuesta.error) throw respuesta.error;
          return [dispositivo.id, respuesta.data];
        })
      );

      const ubicacionesPorDispositivo = new Map(resultadosUbicaciones);

      const dispositivosConUbicacion = listaDispositivos.map((dispositivo) => ({
        ...dispositivo,
        ultima_ubicacion: ubicacionesPorDispositivo.get(dispositivo.id),
      }));

      setDispositivos(dispositivosConUbicacion);
      setGeocercas(respuestaGeocercas.data ?? []);
      setEventos(respuestaEventos.data ?? []);
      setUltimaConsulta(new Date().toISOString());

    } catch (err) {
      setError(
        'No se pudieron cargar los datos. Comprueba las políticas RLS y los permisos de administrador. ' +
        (err?.message ?? 'Error desconocido.')
      );
    } finally {
      cargaEnCursoRef.current = false;
      if (!silencioso) setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (rol !== 'admin') return;

    cargarDatos({ silencioso: false });
    const intervalo = window.setInterval(() => {
      cargarDatos({ silencioso: true });
    }, INTERVALO_ACTUALIZACION);

    return () => window.clearInterval(intervalo);
  }, [rol, cargarDatos]);

  useEffect(() => {
    if (
      rol !== 'admin' ||
      !MAPBOX_TOKEN ||
      !mapaContenedor.current ||
      mapaRef.current
    ) {
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const estiloInicial = tema === 'oscuro' ? ESTILO_OSCURO : ESTILO_CLARO;
    mapaEstiloRef.current = estiloInicial;

    const mapa = new mapboxgl.Map({
      container: mapaContenedor.current,
      style: estiloInicial,
      center: [-68.1193, -16.4897],
      zoom: 11,
      attributionControl: false,
    });

    mapaRef.current = mapa;
    mapa.addControl(new mapboxgl.AttributionControl({ compact: true }), 'bottom-left');

    mapa.on('style.load', () => {
      agregarCapasMapa(mapa);
      setMapaListo(true);
    });

    mapa.on('click', (evento) => {
      const herramienta = herramientaDibujoRef.current;
      if (herramienta) {
        const punto = [evento.lngLat.lng, evento.lngLat.lat];
        const actuales = puntosDibujoRef.current;
        let siguientes = actuales;

        if (herramienta.tipo === 'circulo') {
          if (actuales.length === 0) siguientes = [punto];
        } else if (herramienta.tipo === 'rectangulo') {
          if (actuales.length < 2) siguientes = [...actuales, punto];
        } else {
          siguientes = [...actuales, punto];
        }

        puntosDibujoRef.current = siguientes;
        setPuntosDibujo(siguientes);
        setDibujoFinalizado(false);
        setMensajeDibujo(
          herramienta.tipo === 'circulo'
            ? 'Centro seleccionado. Ajusta el radio y termina el dibujo.'
            : herramienta.tipo === 'rectangulo'
              ? siguientes.length < 2 ? 'Selecciona la esquina opuesta del rectángulo.' : 'Rectángulo definido. Puedes terminar el dibujo.'
              : `${siguientes.length} punto(s) añadido(s).`
        );
        return;
      }

      if (!mapa.getLayer('dispositivos-puntos')) return;

      const elementos = mapa.queryRenderedFeatures(evento.point, {
        layers: ['dispositivos-puntos'],
      });

      if (!elementos.length) return;

      const propiedades = elementos[0].properties;
      const coordenadas = elementos[0].geometry.coordinates.slice();

      const contenido = document.createElement('div');
      contenido.className = 'map-popup-content';

      const titulo = document.createElement('strong');
      titulo.textContent = propiedades?.nombre || 'Dispositivo';
      contenido.appendChild(titulo);

      const estado = document.createElement('p');
      estado.textContent =
        String(propiedades?.enLinea) === 'true' ? 'En línea' : 'Inactivo / sin señal reciente';
      contenido.appendChild(estado);

      if (propiedades?.fecha) {
        const ultima = document.createElement('p');
        ultima.textContent = 'Última ubicación: ' + propiedades.fecha;
        contenido.appendChild(ultima);
      }

      new mapboxgl.Popup({ offset: 12, closeButton: true })
        .setLngLat(coordenadas)
        .setDOMContent(contenido)
        .addTo(mapa);
    });

    let indiceVerticeArrastrado = null;
    let arrastrandoForma = false;
    let inicioArrastre = null;
    let puntosBaseArrastre = null;
    mapa.on('mousedown', (evento) => {
      if (herramientaDibujoRef.current || !puntosDibujoRef.current.length) return;

      const vertice = mapa.getLayer('geocerca-borrador-vertices')
        ? mapa.queryRenderedFeatures(evento.point, { layers: ['geocerca-borrador-vertices'] })[0]
        : null;
      const indice = Number(vertice?.properties?.indice);
      if (Number.isInteger(indice) && indice >= 0) {
        indiceVerticeArrastrado = indice;
        mapa.dragPan.disable();
        mapa.getCanvas().style.cursor = 'grabbing';
        evento.preventDefault();
        return;
      }

      const capasForma = ['geocerca-borrador-relleno', 'geocerca-borrador-linea']
        .filter((id) => mapa.getLayer(id));
      const forma = capasForma.length
        ? mapa.queryRenderedFeatures(evento.point, { layers: capasForma })[0]
        : null;
      if (forma) {
        arrastrandoForma = true;
        inicioArrastre = [evento.lngLat.lng, evento.lngLat.lat];
        puntosBaseArrastre = puntosDibujoRef.current.map((p) => [...p]);
        mapa.dragPan.disable();
        mapa.getCanvas().style.cursor = 'move';
        evento.preventDefault();
      }
    });

    mapa.on('mousemove', (evento) => {
      if (indiceVerticeArrastrado !== null) {
        const nuevos = puntosDibujoRef.current.map((p) => [...p]);
        if (nuevos[indiceVerticeArrastrado]) {
          nuevos[indiceVerticeArrastrado] = [evento.lngLat.lng, evento.lngLat.lat];
          puntosDibujoRef.current = nuevos;
          setPuntosDibujo(nuevos);
          setDibujoFinalizado(true);
        }
        return;
      }

      if (arrastrandoForma && inicioArrastre && puntosBaseArrastre) {
        const deltaLon = evento.lngLat.lng - inicioArrastre[0];
        const deltaLat = evento.lngLat.lat - inicioArrastre[1];
        const nuevos = puntosBaseArrastre.map((p) => [p[0] + deltaLon, p[1] + deltaLat]);
        puntosDibujoRef.current = nuevos;
        setPuntosDibujo(nuevos);
        setDibujoFinalizado(true);
        return;
      }

      if (herramientaDibujoRef.current) {
        mapa.getCanvas().style.cursor = 'crosshair';
        return;
      }
      if (!mapa.getLayer('dispositivos-puntos')) return;
      const elementos = mapa.queryRenderedFeatures(evento.point, {
        layers: ['dispositivos-puntos'],
      });
      mapa.getCanvas().style.cursor = elementos.length ? 'pointer' : '';
    });

    const terminarArrastreVertice = () => {
      if (indiceVerticeArrastrado !== null || arrastrandoForma) {
        indiceVerticeArrastrado = null;
        arrastrandoForma = false;
        inicioArrastre = null;
        puntosBaseArrastre = null;
        mapa.dragPan.enable();
        mapa.getCanvas().style.cursor = '';
      }
    };
    mapa.on('mouseup', terminarArrastreVertice);
    mapa.on('mouseleave', terminarArrastreVertice);

    mapa.on('error', (evento) => {
      console.error('Error de Mapbox:', evento.error);
    });

    return () => {
      mapa.remove();
      mapaRef.current = null;
      mapaEstiloRef.current = '';
      mapaEnfocadoRef.current = false;
      setMapaListo(false);
    };
  }, [rol]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;

    const estiloDeseado = tema === 'oscuro' ? ESTILO_OSCURO : ESTILO_CLARO;
    if (mapaEstiloRef.current === estiloDeseado) return;

    mapaEstiloRef.current = estiloDeseado;
    setMapaListo(false);
    mapa.setStyle(estiloDeseado);
  }, [tema, mapaListo]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapaListo || !mapa) return;

    const puntosDispositivos = dispositivos
      .filter((dispositivo) => {
        const ubicacion = dispositivo.ultima_ubicacion;
        return ubicacion &&
          Number.isFinite(Number(ubicacion.latitud)) &&
          Number.isFinite(Number(ubicacion.longitud));
      })
      .map((dispositivo) => ({
        type: 'Feature',
        properties: {
          id: dispositivo.id,
          nombre: dispositivo.nombre,
          activo: estadoSenal(dispositivo.ultima_ubicacion).enLinea,
          enLinea: estadoSenal(dispositivo.ultima_ubicacion).enLinea,
          fecha: fecha(dispositivo.ultima_ubicacion.registrado_en),
        },
        geometry: {
          type: 'Point',
          coordinates: [
            Number(dispositivo.ultima_ubicacion.longitud),
            Number(dispositivo.ultima_ubicacion.latitud),
          ],
        },
      }));

    const formasGeocercas = geocercas
      .map((geocerca) => {
        const geometry = obtenerGeometriaGeocerca(geocerca);
        if (!geometry) return null;
        return {
          type: 'Feature',
          properties: {
            id: geocerca.id,
            nombre: geocerca.nombre,
            activa: geocerca.activa,
            tipo: geocerca.tipo,
          },
          geometry,
        };
      })
      .filter(Boolean);

    const fuenteDispositivos = mapa.getSource('dispositivos');
    const fuenteGeocercas = mapa.getSource('geocercas');

    if (fuenteDispositivos) {
      fuenteDispositivos.setData({
        type: 'FeatureCollection',
        features: puntosDispositivos,
      });
    }

    if (fuenteGeocercas) {
      fuenteGeocercas.setData({
        type: 'FeatureCollection',
        features: formasGeocercas,
      });
    }

    if (!mapaEnfocadoRef.current) {
      const puntos = [
        ...puntosDispositivos.map((feature) => feature.geometry.coordinates),
        ...geocercas
          .filter((geocerca) => geocerca.activa)
          .flatMap((geocerca) => obtenerPuntosGeocerca(geocerca).map((p) => [Number(p[0]), Number(p[1])]))
          .filter((punto) => punto.length === 2 && punto.every(Number.isFinite)),
      ];

      if (puntos.length === 1) {
        mapa.flyTo({ center: puntos[0], zoom: 14, duration: 700 });
        mapaEnfocadoRef.current = true;
      } else if (puntos.length > 1) {
        const limites = new mapboxgl.LngLatBounds();
        puntos.forEach((punto) => limites.extend(punto));
        mapa.fitBounds(limites, {
          padding: 90,
          maxZoom: 14,
          duration: 700,
        });
        mapaEnfocadoRef.current = true;
      }
    }
  }, [mapaListo, dispositivos, geocercas]);

  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    const fuente = mapa.getSource('geocerca-borrador');
    if (!fuente) return;

    const features = [];
    let geometria = null;
    const puntos = puntosDibujo.map((p) => [Number(p[0]), Number(p[1])]);

    if (editorGeocercaAbierto && puntos.length > 0) {
      if (tipoGeocerca === 'circulo') {
        const radio = Number(radioGeocerca);
        if (Number.isFinite(radio) && radio > 0) {
          geometria = crearCirculo(puntos[0][1], puntos[0][0], radio).geometry;
        }
      } else if (tipoGeocerca === 'rectangulo' && puntos.length >= 2) {
        geometria = crearRectangulo(puntos[0], puntos[1]);
      } else if (tipoGeocerca === 'poligono') {
        geometria = puntos.length >= 3
          ? { type: 'Polygon', coordinates: [cerrarAnillo(puntos)] }
          : puntos.length >= 2 ? { type: 'LineString', coordinates: puntos } : null;
      } else if (tipoGeocerca === 'linea' && puntos.length >= 2) {
        geometria = { type: 'LineString', coordinates: puntos };
      }

      if (geometria) {
        features.push({
          type: 'Feature',
          properties: { borrador: true },
          geometry: geometria,
        });
      }

      puntos.forEach((punto, indice) => {
        features.push({
          type: 'Feature',
          properties: { indice },
          geometry: { type: 'Point', coordinates: punto },
        });
      });
    }

    fuente.setData({ type: 'FeatureCollection', features });
  }, [mapaListo, editorGeocercaAbierto, tipoGeocerca, puntosDibujo, radioGeocerca]);

  const dispositivosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return dispositivos.filter((dispositivo) => {
      if (!termino) return true;
      return (
        (dispositivo.nombre ?? '').toLocaleLowerCase('es').includes(termino) ||
        (dispositivo.descripcion ?? '').toLocaleLowerCase('es').includes(termino)
      );
    });
  }, [dispositivos, busqueda]);

  const geocercasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return geocercas.filter((geocerca) => {
      if (!termino) return true;
      return (
        (geocerca.nombre ?? '').toLocaleLowerCase('es').includes(termino) ||
        (geocerca.descripcion ?? '').toLocaleLowerCase('es').includes(termino)
      );
    });
  }, [geocercas, busqueda]);

  const eventosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLocaleLowerCase('es');
    return eventos.filter((evento) => {
      if (!termino) return true;
      const dispositivo = dispositivos.find((d) => d.id === evento.dispositivo_id);
      const geocerca = geocercas.find((g) => g.id === evento.geocerca_id);
      return [
        evento.tipo,
        dispositivo?.nombre,
        geocerca?.nombre,
      ].some((valor) => (valor ?? '').toLocaleLowerCase('es').includes(termino));
    });
  }, [eventos, dispositivos, geocercas, busqueda]);

  function centrarDispositivo(dispositivo) {
    const ubicacion = dispositivo?.ultima_ubicacion;
    const mapa = mapaRef.current;
    if (!mapa || !ubicacion || !Number.isFinite(Number(ubicacion.longitud)) || !Number.isFinite(Number(ubicacion.latitud))) return;

    mapa.flyTo({
      center: [Number(ubicacion.longitud), Number(ubicacion.latitud)],
      zoom: 16,
      essential: true,
      duration: 800,
    });
  }

  function centrarGeocerca(geocerca) {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const puntos = obtenerPuntosGeocerca(geocerca).map((p) => [Number(p[0]), Number(p[1])]);
    const validos = puntos.filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (validos.length === 0) return;

    if (validos.length === 1) {
      mapa.flyTo({ center: validos[0], zoom: 15, essential: true, duration: 800 });
      return;
    }

    const limites = new mapboxgl.LngLatBounds();
    validos.forEach((p) => limites.extend(p));
    mapa.fitBounds(limites, { padding: 90, maxZoom: 16, duration: 800 });
  }

  function centrarMapa() {
    const mapa = mapaRef.current;
    if (!mapa) return;

    const puntos = [
      ...dispositivos
        .map((dispositivo) => dispositivo.ultima_ubicacion)
        .filter((ubicacion) => ubicacion && Number.isFinite(Number(ubicacion.longitud)) && Number.isFinite(Number(ubicacion.latitud)))
        .map((ubicacion) => [Number(ubicacion.longitud), Number(ubicacion.latitud)]),
      ...geocercas
        .filter((geocerca) => geocerca.activa)
        .flatMap((geocerca) => obtenerPuntosGeocerca(geocerca).map((punto) => [Number(punto[0]), Number(punto[1])]))
        .filter((punto) => punto.length === 2 && punto.every(Number.isFinite)),
    ];

    if (puntos.length === 1) {
      mapa.flyTo({ center: puntos[0], zoom: 15, essential: true, duration: 800 });
      return;
    }
    if (puntos.length > 1) {
      const limites = new mapboxgl.LngLatBounds();
      puntos.forEach((punto) => limites.extend(punto));
      mapa.fitBounds(limites, { padding: 90, maxZoom: 15, duration: 800 });
      return;
    }
    mapa.flyTo({ center: [-68.1193, -16.4897], zoom: 12, duration: 800 });
  }

  function acercarMapa() {
    mapaRef.current?.zoomIn({ duration: 180 });
  }

  function alejarMapa() {
    mapaRef.current?.zoomOut({ duration: 180 });
  }

  function abrirEditorNuevo() {
    herramientaDibujoRef.current = null;
    puntosDibujoRef.current = [];
    setPuntosDibujo([]);
    setTipoGeocerca('circulo');
    setNombreGeocerca('');
    setDescripcionGeocerca('');
    setRadioGeocerca('150');
    setGeocercaEditando(null);
    setModoDibujo(false);
    setDibujoFinalizado(false);
    setMensajeDibujo('Elige una forma y comienza a dibujar sobre el mapa.');
    setEditorGeocercaAbierto(true);
  }

  function editarGeocerca(geocerca) {
    const puntos = geocerca.tipo === 'circulo'
      ? [[Number(geocerca.longitud), Number(geocerca.latitud)]]
      : obtenerPuntosGeocerca(geocerca).map((p) => [Number(p[0]), Number(p[1])]);
    const puntosSinCierre = geocerca.tipo === 'poligono' && puntos.length > 1 &&
      puntos[0][0] === puntos[puntos.length - 1][0] &&
      puntos[0][1] === puntos[puntos.length - 1][1]
      ? puntos.slice(0, -1)
      : puntos;

    herramientaDibujoRef.current = null;
    puntosDibujoRef.current = puntosSinCierre;
    setPuntosDibujo(puntosSinCierre);
    setTipoGeocerca(geocerca.tipo === 'circulo' ? 'circulo' : geocerca.tipo === 'linea' ? 'linea' : geocerca.geometria?.forma === 'rectangulo' ? 'rectangulo' : 'poligono');
    setNombreGeocerca(geocerca.nombre ?? '');
    setDescripcionGeocerca(geocerca.descripcion ?? '');
    setRadioGeocerca(String(geocerca.radio_m ?? 150));
    setGeocercaEditando(geocerca.id);
    setModoDibujo(false);
    setDibujoFinalizado(true);
    setMensajeDibujo('Geocerca cargada. Arrastra los vértices para ajustarlos o el borde/área para mover la forma.');
    setEditorGeocercaAbierto(true);
    centrarGeocerca(geocerca);
  }

  function iniciarDibujo(tipoForzado = tipoGeocerca) {
    if (!mapaRef.current || !mapaListo) {
      setMensajeDibujo('El mapa todavía no está listo. Espera un momento.');
      return;
    }
    setTipoGeocerca(tipoForzado);
    herramientaDibujoRef.current = { tipo: tipoForzado };
    puntosDibujoRef.current = [];
    setPuntosDibujo([]);
    setModoDibujo(true);
    setDibujoFinalizado(false);
    setMensajeDibujo(
      tipoForzado === 'circulo'
        ? 'Haz clic en el mapa para elegir el centro del círculo.'
        : tipoForzado === 'rectangulo'
          ? 'Haz clic en dos esquinas opuestas del rectángulo.'
          : tipoForzado === 'linea'
            ? 'Haz clic en el mapa para agregar los puntos de la línea.'
            : 'Haz clic en el mapa para agregar los vértices del polígono.'
    );
    mapaRef.current.getCanvas().style.cursor = 'crosshair';
  }

  function activarHerramientaGeocerca(tipo) {
    if (!['circulo', 'rectangulo', 'poligono', 'linea'].includes(tipo)) return;
    abrirEditorNuevo();
    iniciarDibujo(tipo);
  }

  function terminarDibujo() {
    const cantidad = puntosDibujoRef.current.length;
    const minimo = tipoGeocerca === 'circulo' ? 1 :
      tipoGeocerca === 'rectangulo' ? 2 : tipoGeocerca === 'linea' ? 2 : 3;

    if (cantidad < minimo) {
      setMensajeDibujo(`Faltan puntos. Esta forma necesita al menos ${minimo}.`);
      return;
    }

    herramientaDibujoRef.current = null;
    setModoDibujo(false);
    setDibujoFinalizado(true);
    if (mapaRef.current) mapaRef.current.getCanvas().style.cursor = '';
    setMensajeDibujo('Dibujo terminado. Revisa la forma y guarda la geocerca.');
  }

  function deshacerPunto() {
    const nuevos = puntosDibujoRef.current.slice(0, -1);
    puntosDibujoRef.current = nuevos;
    setPuntosDibujo(nuevos);
    const minimo = tipoGeocerca === 'circulo' ? 1 :
      tipoGeocerca === 'rectangulo' ? 2 : tipoGeocerca === 'linea' ? 2 : 3;
    setDibujoFinalizado(!modoDibujo && nuevos.length >= minimo);
    setMensajeDibujo(nuevos.length ? `${nuevos.length} punto(s) restante(s).` : 'No hay puntos dibujados.');
  }

  function cancelarEditor() {
    herramientaDibujoRef.current = null;
    puntosDibujoRef.current = [];
    setPuntosDibujo([]);
    setModoDibujo(false);
    setDibujoFinalizado(false);
    setEditorGeocercaAbierto(false);
    setGeocercaEditando(null);
    setMensajeDibujo('');
    if (mapaRef.current) mapaRef.current.getCanvas().style.cursor = '';
  }

  
async function guardarGeocerca() {
  if (!supabase || !usuario || guardandoGeocerca) return;

  const nombre = nombreGeocerca.trim();

  if (!nombre) {
    setMensajeDibujo('Escribe un nombre para la geocerca.');
    return;
  }

  if (!dibujoFinalizado) {
    setMensajeDibujo('Primero termina el dibujo antes de guardar.');
    return;
  }

  const puntos = puntosDibujoRef.current.map((p) => [
    Number(p[0]),
    Number(p[1])
  ]);

  const minimo = tipoGeocerca === 'circulo' ? 1 :
    tipoGeocerca === 'rectangulo' ? 2 :
    tipoGeocerca === 'linea' ? 2 : 3;

  if (puntos.length < minimo) {
    setMensajeDibujo(`La forma necesita al menos ${minimo} punto(s).`);
    return;
  }

  let tipoDb = 'poligono';
  let geometria = null;
  let latitud;
  let longitud;
  let radio_m = 1;

  if (tipoGeocerca === 'circulo') {
    tipoDb = 'circulo';
    latitud = puntos[0][1];
    longitud = puntos[0][0];
    radio_m = Math.round(Number(radioGeocerca));

    if (!Number.isFinite(radio_m) || radio_m < 1 || radio_m > 1000000) {
      setMensajeDibujo('El radio debe estar entre 1 y 1.000.000 metros.');
      return;
    }
  } else {
    const puntosCentro = tipoGeocerca === 'rectangulo'
      ? [puntos[0], puntos[1]]
      : puntos;

    longitud = puntosCentro.reduce((suma, p) => suma + p[0], 0) / puntosCentro.length;
    latitud = puntosCentro.reduce((suma, p) => suma + p[1], 0) / puntosCentro.length;

    radio_m = Math.max(
      1,
      Math.round(
        Math.max(...puntos.map((p) =>
          distanciaMetros([longitud, latitud], p)
        ))
      )
    );

    if (radio_m > 1000000) {
      setMensajeDibujo('La geometría es demasiado extensa para el límite actual de la tabla.');
      return;
    }

    if (tipoGeocerca === 'linea') {
      tipoDb = 'linea';
      geometria = {
        type: 'LineString',
        coordinates: puntos
      };
    } else if (tipoGeocerca === 'rectangulo') {
      geometria = {
        ...crearRectangulo(puntos[0], puntos[1]),
        forma: 'rectangulo'
      };
    } else {
      geometria = {
        type: 'Polygon',
        coordinates: [cerrarAnillo(puntos)]
      };
    }
  }

  const datos = {
    nombre,
    descripcion: descripcionGeocerca.trim() || null,
    latitud,
    longitud,
    radio_m,
    tipo: tipoDb,
    geometria,
  };

  setGuardandoGeocerca(true);
  setError('');

  try {
    let respuesta;

    if (geocercaEditando) {
      // ACTUALIZAR GEOCERCA
      respuesta = await supabase
        .from('geocercas')
        .update(datos)
        .eq('id', geocercaEditando)
        .select('id,propietario_id,nombre,descripcion,latitud,longitud,radio_m,activa,tipo,geometria,creado_en')
        .single();

    } else {
      // COMPROBAR SESIÓN AUTENTICADA
      const {
        data: { user: usuarioAuth },
        error: errorAuth
      } = await supabase.auth.getUser();

      console.log('Usuario del estado:', usuario?.id);
      console.log('Usuario autenticado:', usuarioAuth?.id);
      console.log('Error de autenticación:', errorAuth);
      console.log('Propietario que se enviará:', usuarioAuth?.id);

      if (errorAuth) throw errorAuth;

      if (!usuarioAuth) {
        throw new Error('No hay un usuario autenticado.');
      }

      if (usuarioAuth.id !== usuario.id) {
        throw new Error('El usuario autenticado no coincide con el usuario del panel.');
      }

      // INSERTAR GEOCERCA
      respuesta = await supabase
        .from('geocercas')
        .insert({
          ...datos,
          propietario_id: usuarioAuth.id,
          activa: true
        })
        .select('id,propietario_id,nombre,descripcion,latitud,longitud,radio_m,activa,tipo,geometria,creado_en')
        .single();
    }

    if (respuesta.error) throw respuesta.error;

    if (!respuesta.data) {
      throw new Error('No se recibió la geocerca guardada.');
    }

    // ACTUALIZAR LISTA LOCAL
    setGeocercas((actuales) => geocercaEditando
      ? actuales.map((g) =>
          g.id === geocercaEditando ? respuesta.data : g
        )
      : [respuesta.data, ...actuales]
    );

    // LIMPIAR EDITOR
    herramientaDibujoRef.current = null;
    puntosDibujoRef.current = [];

    setPuntosDibujo([]);
    setModoDibujo(false);
    setDibujoFinalizado(false);
    setGeocercaEditando(null);
    setNombreGeocerca('');
    setDescripcionGeocerca('');

    if (mapaRef.current) {
      mapaRef.current.getCanvas().style.cursor = '';
    }

    setMensajeDibujo('Geocerca guardada correctamente.');

  } catch (err) {
    console.error('Error al guardar geocerca:', err);

    setMensajeDibujo(
      'No se pudo guardar: ' +
      (err?.message ?? 'Error desconocido.')
    );

  } finally {
    setGuardandoGeocerca(false);
  }
}


  async function cambiarEstadoGeocerca(geocerca) {
    const { data, error: err } = await supabase
      .from('geocercas')
      .update({ activa: !geocerca.activa })
      .eq('id', geocerca.id)
      .select('id,activa')
      .single();
    if (err) {
      setError('No se pudo cambiar el estado de la geocerca: ' + err.message);
      return;
    }
    setGeocercas((actuales) => actuales.map((g) => g.id === geocerca.id ? { ...g, activa: data.activa } : g));
  }

  async function eliminarGeocerca(geocerca) {
    if (!window.confirm(`¿Eliminar la geocerca "${geocerca.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error: err } = await supabase.from('geocercas').delete().eq('id', geocerca.id);
    if (err) {
      setError('No se pudo eliminar la geocerca: ' + err.message);
      return;
    }
    setGeocercas((actuales) => actuales.filter((g) => g.id !== geocerca.id));
  }

  async function iniciarSesion(evento) {
    evento.preventDefault();
    if (!supabase) return;

    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });

    if (err) setError('No se pudo iniciar sesión: ' + err.message);
  }

  async function cerrarSesion() {
    if (!supabase) return;

    const { error: err } = await supabase.auth.signOut();
    if (err) setError(err.message);
  }

  const nombreDispositivo = (id) =>
    dispositivos.find((dispositivo) => dispositivo.id === id)?.nombre ?? 'Dispositivo no disponible';

  const obtenerNombreGeocerca = (id) =>
    geocercas.find((geocerca) => geocerca.id === id)?.nombre ?? 'Geocerca no disponible';

  if (!sesionLista) {
    return (
      <main className={`gps-app theme-${tema} login-loading`}>
        <div className="loading-indicator" />
        <p>Comprobando sesión...</p>
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className={`gps-app theme-${tema} login-page`}>
        <section className="login-card">
          <div className="brand-lockup login-brand">
            <div className="brand-symbol"><Icono nombre="pin" tamano={24} /></div>
            <div>
              <div className="brand-name">Nexo GPS</div>
              <div className="brand-caption">Plataforma de monitoreo</div>
            </div>
          </div>

          <div className="login-heading">
            <p className="eyebrow">ACCESO SEGURO</p>
            <h1>Iniciar sesión</h1>
            <p>Accede al panel de seguimiento y administración de ubicaciones.</p>
          </div>

          <form onSubmit={iniciarSesion} className="login-form">
            <label htmlFor="correo">Correo electrónico</label>
            <input
              id="correo"
              type="email"
              required
              autoComplete="email"
              placeholder="nombre@correo.com"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
            />

            <label htmlFor="contrasena">Contraseña</label>
            <input
              id="contrasena"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Introduce tu contraseña"
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
            />

            <button type="submit" className="button button-primary login-submit">
              Iniciar sesión
            </button>
          </form>

          {error && <div className="alert alert-error">{error}</div>}

          <p className="login-footnote">
            El acceso al panel está limitado a cuentas autorizadas.
          </p>
        </section>
      </main>
    );
  }

  if (verificandoRol) {
    return (
      <main className={`gps-app theme-${tema} login-loading`}>
        <div className="loading-indicator" />
        <p>Verificando permisos de acceso...</p>
      </main>
    );
  }

  if (rol !== 'admin') {
    return (
      <main className={`gps-app theme-${tema} login-page`}>
        <section className="login-card access-denied">
          <div className="brand-symbol"><Icono nombre="pin" tamano={24} /></div>
          <h1>Acceso restringido</h1>
          <p>Esta cuenta no tiene permisos de administrador para acceder al panel.</p>
          {error && <div className="alert alert-error">{error}</div>}
          <button onClick={cerrarSesion} className="button button-secondary">
            <Icono nombre="logout" tamano={17} />
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  const cantidadSinUbicacion = dispositivos.filter(
    (dispositivo) => !dispositivo.ultima_ubicacion
  ).length;
  const cantidadEnLinea = dispositivos.filter(
    (dispositivo) => estadoSenal(dispositivo.ultima_ubicacion).enLinea
  ).length;

  return (
    <main className={`gps-app theme-${tema}`}>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-intro sidebar-brand-header">
            <div className="sidebar-brand-main">
              <div className="brand-symbol"><Icono nombre="pin" tamano={22} /></div>
              <div className="brand-text">
                <div className="brand-name">Nexo GPS</div>
                <div className="brand-caption">Centro de monitoreo</div>
              </div>
            </div>
            <div className="sidebar-header-actions">
              <button type="button" className="sidebar-tool-button" onClick={() => setTema((actual) => actual === 'claro' ? 'oscuro' : 'claro')} title={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'} aria-label={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}>
                <Icono nombre={tema === 'claro' ? 'moon' : 'sun'} tamano={18} />
              </button>
              <button type="button" className="sidebar-tool-button" onClick={() => cargarDatos({ silencioso: false })} disabled={cargando} title="Actualizar datos" aria-label="Actualizar datos">
                <Icono nombre="refresh" tamano={18} />
              </button>
            </div>
            <div className="sidebar-sync-line">
              <span className={`status-dot ${ultimaConsulta ? 'is-active' : 'is-inactive'}`} />
              <span>{ultimaConsulta ? `Sincronizado ${horaCorta(ultimaConsulta)}` : 'Esperando sincronización'}</span>
              <span className="sync-frequency">· cada 5 s</span>
            </div>
          </div>

          <div className="sidebar-metrics">
            <div className="metric-tile">
              <span className="metric-label">Dispositivos</span>
              <strong>{dispositivos.length}</strong>
              <span className="metric-foot">{cantidadEnLinea} en línea · {dispositivos.length - cantidadEnLinea} inactivos</span>
            </div>
            <div className="metric-tile">
              <span className="metric-label">Geocercas</span>
              <strong>{geocercas.length}</strong>
              <span className="metric-foot">{geocercas.filter((g) => g.activa).length} activas</span>
            </div>
          </div>

          <div className="sidebar-search">
            <Icono nombre="search" tamano={18} />
            <input
              aria-label="Buscar dispositivos o geocercas"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
              placeholder="Buscar en el mapa"
            />
            {busqueda && (
              <button type="button" className="search-clear" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda">
                <Icono nombre="close" tamano={15} />
              </button>
            )}
          </div>

          <nav className="sidebar-tabs" aria-label="Secciones del panel">
            {[
              { id: 'todos', etiqueta: 'Todo' },
              { id: 'dispositivos', etiqueta: 'Dispositivos' },
              { id: 'geocercas', etiqueta: 'Geocercas' },
              { id: 'eventos', etiqueta: 'Eventos' },
            ].map((item) => (
              <button
                type="button"
                key={item.id}
                className={`sidebar-tab ${seccionLateral === item.id ? 'is-active' : ''}`}
                onClick={() => setSeccionLateral(item.id)}
              >
                {item.etiqueta}
              </button>
            ))}
          </nav>

          <div className="sidebar-content">
            {error && (
              <div className="alert alert-error sidebar-alert">
                <strong>No se pudo actualizar</strong>
                <span>{error}</span>
              </div>
            )}

            {(seccionLateral === 'todos' || seccionLateral === 'dispositivos') && (
              <section className="sidebar-section">
                <div className="section-heading section-heading-spread">
                  <div className="section-heading-title">
                    <span className="section-icon"><Icono nombre="device" tamano={17} /></span>
                    <h2>Dispositivos</h2>
                  </div>
                  <span className="count-badge">{dispositivosFiltrados.length}</span>
                </div>

                {dispositivosFiltrados.length === 0 ? (
                  <p className="empty-message">No se encontraron dispositivos.</p>
                ) : (
                  <div className="entity-list">
                    {dispositivosFiltrados.map((dispositivo) => {
                      const senal = estadoSenal(dispositivo.ultima_ubicacion);
                      const enLinea = senal.enLinea;

                      return (
                        <button
                          type="button"
                          key={dispositivo.id}
                          className="entity-card"
                          onClick={() => centrarDispositivo(dispositivo)}
                        >
                          <span className={`entity-marker device-marker ${enLinea ? '' : 'is-inactive'}`}>
                            <Icono nombre="device" tamano={17} />
                          </span>
                          <span className="entity-main">
                            <span className="entity-title">{dispositivo.nombre}</span>
                            <span className="entity-subtitle">{senal.detalle}</span>
                            <span className="entity-meta">
                              <span className={`status-dot ${enLinea ? 'is-active' : 'is-inactive'}`} />
                              {enLinea ? 'En línea' : 'Inactivo'}
                              <span className={`signal-label signal-${senal.tono}`}>{senal.etiqueta}</span>
                            </span>
                          </span>
                          <Icono nombre="chevron" tamano={17} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {(seccionLateral === 'todos' || seccionLateral === 'geocercas') && (
              <section className="sidebar-section">
                <div className="section-heading section-heading-spread">
                  <div className="section-heading-title">
                    <span className="section-icon"><Icono nombre="fence" tamano={17} /></span>
                    <h2>Geocercas</h2>
                  </div>
                  <span className="count-badge">{geocercasFiltradas.length}</span>
                </div>

                {geocercasFiltradas.length === 0 ? (
                  <p className="empty-message">No se encontraron geocercas.</p>
                ) : (
                  <div className="entity-list">
                    {geocercasFiltradas.map((geocerca) => (
                      <div className="geofence-list-item" key={geocerca.id}>
                        <button
                          type="button"
                          className="entity-card geofence-main-card"
                          onClick={() => centrarGeocerca(geocerca)}
                        >
                          <span className={`entity-marker geofence-marker ${geocerca.activa ? '' : 'is-inactive'}`}>
                            <Icono nombre="fence" tamano={17} />
                          </span>
                          <span className="entity-main">
                            <span className="entity-title">{geocerca.nombre}</span>
                            <span className="entity-subtitle">{etiquetaTipoGeocerca(geocerca)}{geocerca.tipo === 'circulo' ? ` · Radio ${geocerca.radio_m} m` : ''}</span>
                            <span className="entity-meta">
                              <span className={`status-dot ${geocerca.activa ? 'is-active' : 'is-inactive'}`} />
                              {geocerca.activa ? 'Activa' : 'Inactiva'}
                              {geocerca.propietario_id === usuario.id ? ' · Propia' : ''}
                            </span>
                          </span>
                          <Icono nombre="chevron" tamano={17} />
                        </button>
                        <div className="geofence-actions">
                          <button type="button" className="geofence-action" onClick={() => editarGeocerca(geocerca)}>Editar</button>
                          <button type="button" className="geofence-action" onClick={() => cambiarEstadoGeocerca(geocerca)}>{geocerca.activa ? 'Desactivar' : 'Activar'}</button>
                          <button type="button" className="geofence-action danger" onClick={() => eliminarGeocerca(geocerca)}>Eliminar</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {(seccionLateral === 'todos' || seccionLateral === 'eventos') && (
              <section className="sidebar-section">
                <div className="section-heading section-heading-spread">
                  <div className="section-heading-title">
                    <span className="section-icon"><Icono nombre="history" tamano={17} /></span>
                    <h2>Eventos recientes</h2>
                  </div>
                  <span className="count-badge">{eventosFiltrados.length}</span>
                </div>

                {eventosFiltrados.length === 0 ? (
                  <p className="empty-message">No hay eventos para mostrar.</p>
                ) : (
                  <div className="event-list">
                    {eventosFiltrados.slice(0, seccionLateral === 'todos' ? 5 : 50).map((evento) => (
                      <div className="event-row" key={evento.id}>
                        <span className={`event-indicator ${evento.tipo === 'entrada' ? 'event-entry' : evento.tipo === 'salida' ? 'event-exit' : 'event-cross'}`} />
                        <div className="event-copy">
                          <strong>
                            {evento.tipo === 'entrada' ? 'Entrada a geocerca' : evento.tipo === 'salida' ? 'Salida de geocerca' : 'Cruce de línea'}
                          </strong>
                          <span>{nombreDispositivo(evento.dispositivo_id)} · {obtenerNombreGeocerca(evento.geocerca_id)}</span>
                          <time>{fecha(evento.ocurrido_en)}</time>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {cantidadSinUbicacion > 0 && (
              <div className="sidebar-note">
                <strong>{cantidadSinUbicacion} dispositivo{cantidadSinUbicacion === 1 ? '' : 's'} sin ubicación</strong>
                <span>El indicador depende de los registros guardados en Supabase; no confirma por sí solo que el teléfono esté conectado.</span>
              </div>
            )}
          </div>

          <footer className="sidebar-footer">
            <span className="account-avatar">
              {(usuario.email?.charAt(0) ?? 'A').toUpperCase()}
            </span>
            <span className="account-copy">
              <strong>{usuario.email}</strong>
              <span>Administrador</span>
            </span>
            <button type="button" className="icon-button" onClick={cerrarSesion} title="Cerrar sesión">
              <Icono nombre="logout" tamano={17} />
            </button>
          </footer>
        </aside>

        <section className="map-workspace" aria-label="Mapa de seguimiento">
          <div className="map-frame">
            {!MAPBOX_TOKEN ? (
              <div className="map-message">
                <div className="map-message-symbol"><Icono nombre="pin" tamano={27} /></div>
                <h3>Falta la clave de Mapbox</h3>
                <p>Añade NEXT_PUBLIC_MAPBOX_TOKEN en el archivo .env.local y reinicia el servidor de desarrollo.</p>
              </div>
            ) : (
              <div ref={mapaContenedor} className="map-canvas" />
            )}


            <div
              className="map-draw-toolbar map-draw-toolbar-pro"
              role="group"
              aria-label="Herramientas para crear geocercas"
            >
              <button
                type="button"
                className={`shape-tool-button ${editorGeocercaAbierto && tipoGeocerca === 'circulo' ? 'is-selected' : ''}`}
                onClick={() => activarHerramientaGeocerca('circulo')}
                title="Crear círculo"
                aria-label="Crear círculo"
                aria-pressed={editorGeocercaAbierto && tipoGeocerca === 'circulo'}
                disabled={!!geocercaEditando}
              >
                <Icono nombre="shape-circle" tamano={21} />
              </button>

              <button
                type="button"
                className={`shape-tool-button ${editorGeocercaAbierto && tipoGeocerca === 'rectangulo' ? 'is-selected' : ''}`}
                onClick={() => activarHerramientaGeocerca('rectangulo')}
                title="Crear rectángulo"
                aria-label="Crear rectángulo"
                aria-pressed={editorGeocercaAbierto && tipoGeocerca === 'rectangulo'}
                disabled={!!geocercaEditando}
              >
                <Icono nombre="shape-rectangle" tamano={21} />
              </button>

              <button
                type="button"
                className={`shape-tool-button ${editorGeocercaAbierto && tipoGeocerca === 'poligono' ? 'is-selected' : ''}`}
                onClick={() => activarHerramientaGeocerca('poligono')}
                title="Crear polígono"
                aria-label="Crear polígono"
                aria-pressed={editorGeocercaAbierto && tipoGeocerca === 'poligono'}
                disabled={!!geocercaEditando}
              >
                <Icono nombre="shape-polygon" tamano={21} />
              </button>

              <button
                type="button"
                className={`shape-tool-button ${editorGeocercaAbierto && tipoGeocerca === 'linea' ? 'is-selected' : ''}`}
                onClick={() => activarHerramientaGeocerca('linea')}
                title="Crear línea"
                aria-label="Crear línea"
                aria-pressed={editorGeocercaAbierto && tipoGeocerca === 'linea'}
                disabled={!!geocercaEditando}
              >
                <Icono nombre="shape-line" tamano={21} />
              </button>
            </div>

            <div className="map-bottom-controls" role="group" aria-label="Controles del mapa">
              <button type="button" className="map-round-control" onClick={acercarMapa} title="Acercar" aria-label="Acercar">+</button>
              <button type="button" className="map-round-control" onClick={alejarMapa} title="Alejar" aria-label="Alejar">−</button>
              <span className="map-control-divider" />
              <button type="button" className="map-round-control map-center-control" onClick={centrarMapa} title="Centrar mapa" aria-label="Centrar mapa">
                <Icono nombre="crosshair" tamano={20} />
              </button>
            </div>

            {editorGeocercaAbierto && (
              <section className="draw-editor" aria-label="Editor de geocercas">
                <div className="draw-editor-heading">
                  <div>
                    <strong>{geocercaEditando ? 'Editar geocerca' : 'Nueva geocerca'}</strong>
                    <span>Dibuja directamente sobre el mapa</span>
                  </div>
                  <button type="button" className="draw-close" onClick={cancelarEditor} aria-label="Cerrar editor">×</button>
                </div>

                <label className="draw-field">
                  <span>Nombre</span>
                  <input value={nombreGeocerca} onChange={(e) => setNombreGeocerca(e.target.value)} maxLength={100} placeholder="Ej. Zona de trabajo" />
                </label>
                <label className="draw-field">
                  <span>Descripción (opcional)</span>
                  <input value={descripcionGeocerca} onChange={(e) => setDescripcionGeocerca(e.target.value)} maxLength={250} placeholder="Detalle de la zona" />
                </label>
                {tipoGeocerca === 'circulo' && (
                  <label className="draw-field">
                    <span>Radio (metros)</span>
                    <input type="number" min="1" max="1000000" step="1" value={radioGeocerca} onChange={(e) => setRadioGeocerca(e.target.value)} />
                  </label>
                )}
                <div className="draw-help">
                  {tipoGeocerca === 'circulo' ? 'Un clic elige el centro. El radio se define arriba.' :
                    tipoGeocerca === 'rectangulo' ? 'Marca dos esquinas opuestas.' :
                      tipoGeocerca === 'linea' ? 'Marca al menos dos puntos para formar la línea.' :
                        'Marca al menos tres vértices para cerrar el área.'}
                </div>
                {dibujoFinalizado && puntosDibujo.length > 0 && (
                  <div className="draw-help">Ajuste: arrastra un punto para mover ese vértice; arrastra el borde o el área para mover toda la forma.</div>
                )}
                {mensajeDibujo && <p className="draw-message">{mensajeDibujo}</p>}
                <div className="draw-point-count">Puntos: <strong>{puntosDibujo.length}</strong></div>
                <div className="draw-actions">
                  <button type="button" className="button button-secondary" onClick={deshacerPunto} disabled={!puntosDibujo.length}>Deshacer punto</button>
                  <button type="button" className="button button-secondary" onClick={terminarDibujo} disabled={!modoDibujo}>Terminar</button>
                </div>
                <div className="draw-actions draw-actions-bottom">
                  <button type="button" className="button button-primary" onClick={guardarGeocerca} disabled={!dibujoFinalizado || guardandoGeocerca}>
                    {guardandoGeocerca ? 'Guardando...' : geocercaEditando ? 'Guardar cambios' : 'Guardar geocerca'}
                  </button>
                  <button type="button" className="button button-quiet" onClick={cancelarEditor}>Cancelar</button>
                </div>
              </section>
            )}

          </div>


        </section>
      </div>
    </main>
  );
}
