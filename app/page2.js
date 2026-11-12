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
    return {
      etiqueta: 'Sin ubicación',
      detalle: 'Todavía no hay coordenadas guardadas',
      tono: 'muted',
    };
  }

  const instante = new Date(ubicacion.registrado_en).getTime();
  if (!Number.isFinite(instante)) {
    return {
      etiqueta: 'Fecha inválida',
      detalle: 'No se puede interpretar la fecha de la última ubicación',
      tono: 'muted',
    };
  }

  const antiguedad = Date.now() - instante;

  if (antiguedad <= 120000 && antiguedad >= -60000) {
    return {
      etiqueta: 'Actualizada',
      detalle: 'Última ubicación: ' + horaCorta(ubicacion.registrado_en),
      tono: 'good',
    };
  }

  return {
    etiqueta: 'Sin actualización reciente',
    detalle: 'Última ubicación: ' + fecha(ubicacion.registrado_en),
    tono: 'warning',
  };
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
        'circle-radius': [
          'case',
          ['==', ['get', 'seleccionado'], true],
          10,
          7,
        ],
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
  const [dispositivoSeleccionadoId, setDispositivoSeleccionadoId] = useState(null);
  const [detalleAbierto, setDetalleAbierto] = useState(true);

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
      setDispositivoSeleccionadoId(null);
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
          .select('id,nombre,descripcion,activo,creado_en')
          .order('creado_en', { ascending: false }),

        supabase
          .from('geocercas')
          .select(
            'id,nombre,descripcion,latitud,longitud,radio_m,activa,creado_en'
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

      if (dispositivoSeleccionadoId && !dispositivosConUbicacion.some(
        (d) => d.id === dispositivoSeleccionadoId
      )) {
        setDispositivoSeleccionadoId(null);
      }
    } catch (err) {
      setError(
        'No se pudieron cargar los datos. Comprueba las políticas RLS y los permisos de administrador. ' +
        (err?.message ?? 'Error desconocido.')
      );
    } finally {
      cargaEnCursoRef.current = false;
      if (!silencioso) setCargando(false);
    }
  }, [dispositivoSeleccionadoId]);

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
      attributionControl: true,
    });

    mapaRef.current = mapa;
    mapa.addControl(new mapboxgl.NavigationControl(), 'top-right');
    mapa.addControl(new mapboxgl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');

    mapa.on('style.load', () => {
      agregarCapasMapa(mapa);
      setMapaListo(true);
    });

    mapa.on('click', (evento) => {
      if (!mapa.getLayer('dispositivos-puntos')) return;

      const elementos = mapa.queryRenderedFeatures(evento.point, {
        layers: ['dispositivos-puntos'],
      });

      if (!elementos.length) return;

      const propiedades = elementos[0].properties;
      const coordenadas = elementos[0].geometry.coordinates.slice();

      if (propiedades?.id) {
        setDispositivoSeleccionadoId(String(propiedades.id));
      }

      const contenido = document.createElement('div');
      contenido.className = 'map-popup-content';

      const titulo = document.createElement('strong');
      titulo.textContent = propiedades?.nombre || 'Dispositivo';
      contenido.appendChild(titulo);

      const estado = document.createElement('p');
      estado.textContent =
        String(propiedades?.activo) === 'true' ? 'Dispositivo activo' : 'Dispositivo inactivo';
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

    mapa.on('mousemove', (evento) => {
      if (!mapa.getLayer('dispositivos-puntos')) return;
      const elementos = mapa.queryRenderedFeatures(evento.point, {
        layers: ['dispositivos-puntos'],
      });
      mapa.getCanvas().style.cursor = elementos.length ? 'pointer' : '';
    });

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
          activo: dispositivo.activo,
          seleccionado: dispositivo.id === dispositivoSeleccionadoId,
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

    const circulosGeocercas = geocercas
      .filter((geocerca) =>
        Number.isFinite(Number(geocerca.latitud)) &&
        Number.isFinite(Number(geocerca.longitud)) &&
        Number(geocerca.radio_m) > 0
      )
      .map((geocerca) => ({
        ...crearCirculo(geocerca.latitud, geocerca.longitud, geocerca.radio_m),
        properties: {
          id: geocerca.id,
          nombre: geocerca.nombre,
          activa: geocerca.activa,
        },
      }));

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
        features: circulosGeocercas,
      });
    }

    if (!mapaEnfocadoRef.current) {
      const puntos = [
        ...puntosDispositivos.map((feature) => feature.geometry.coordinates),
        ...geocercas
          .filter((geocerca) => geocerca.activa)
          .map((geocerca) => [Number(geocerca.longitud), Number(geocerca.latitud)])
          .filter((punto) => punto.every(Number.isFinite)),
      ];

      if (puntos.length === 1) {
        mapa.flyTo({ center: puntos[0], zoom: 14, duration: 700 });
        mapaEnfocadoRef.current = true;
      } else if (puntos.length > 1) {
        const limites = new mapboxgl.LngLatBounds();
        puntos.forEach((punto) => limites.extend(punto));
        mapa.fitBounds(limites, {
          padding: { top: 90, right: 90, bottom: 90, left: 90 },
          maxZoom: 14,
          duration: 700,
        });
        mapaEnfocadoRef.current = true;
      }
    }
  }, [mapaListo, dispositivos, geocercas, dispositivoSeleccionadoId]);

  const dispositivoSeleccionado = useMemo(
    () => dispositivos.find((d) => d.id === dispositivoSeleccionadoId) ?? null,
    [dispositivos, dispositivoSeleccionadoId]
  );

  useEffect(() => {
    if (!dispositivoSeleccionadoId && dispositivos.length > 0) {
      setDispositivoSeleccionadoId(dispositivos[0].id);
    }
  }, [dispositivos, dispositivoSeleccionadoId]);

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

  function seleccionarDispositivo(dispositivo) {
    setDispositivoSeleccionadoId(dispositivo.id);
    setDetalleAbierto(true);

    const ubicacion = dispositivo.ultima_ubicacion;
    const mapa = mapaRef.current;

    if (
      mapa &&
      ubicacion &&
      Number.isFinite(Number(ubicacion.longitud)) &&
      Number.isFinite(Number(ubicacion.latitud))
    ) {
      mapa.flyTo({
        center: [Number(ubicacion.longitud), Number(ubicacion.latitud)],
        zoom: 15,
        essential: true,
        duration: 800,
      });
    }
  }

  function centrarGeocerca(geocerca) {
    const mapa = mapaRef.current;
    if (!mapa) return;

    mapa.flyTo({
      center: [Number(geocerca.longitud), Number(geocerca.latitud)],
      zoom: 15,
      essential: true,
      duration: 800,
    });
  }

  function centrarMapa() {
    const mapa = mapaRef.current;
    if (!mapa) return;

    if (dispositivoSeleccionado?.ultima_ubicacion) {
      const ubicacion = dispositivoSeleccionado.ultima_ubicacion;
      mapa.flyTo({
        center: [Number(ubicacion.longitud), Number(ubicacion.latitud)],
        zoom: 15,
        essential: true,
        duration: 800,
      });
      return;
    }

    mapa.flyTo({ center: [-68.1193, -16.4897], zoom: 11, duration: 800 });
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

  const nombreGeocerca = (id) =>
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

  return (
    <main className={`gps-app theme-${tema}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-symbol"><Icono nombre="pin" tamano={23} /></div>
          <div className="brand-text">
            <div className="brand-name">Nexo GPS</div>
            <div className="brand-caption">Centro de monitoreo</div>
          </div>
        </div>

        <div className="topbar-center">
          <span className="connection-indicator" />
          <span>Panel de administración</span>
          <span className="topbar-divider" />
          <span className="topbar-subtle">
            {ultimaConsulta ? `Sincronizado ${horaCorta(ultimaConsulta)}` : 'Esperando sincronización'}
          </span>
        </div>

        <div className="topbar-actions">
          <button
            type="button"
            className="button button-quiet theme-button"
            onClick={() => setTema((actual) => actual === 'claro' ? 'oscuro' : 'claro')}
            title={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}
          >
            <Icono nombre={tema === 'claro' ? 'moon' : 'sun'} tamano={18} />
            <span>{tema === 'claro' ? 'Modo oscuro' : 'Modo claro'}</span>
          </button>

          <button
            type="button"
            className="button button-primary refresh-button"
            onClick={() => cargarDatos({ silencioso: false })}
            disabled={cargando}
          >
            <Icono nombre="refresh" tamano={17} />
            <span>{cargando ? 'Actualizando' : 'Actualizar'}</span>
          </button>

          <button
            type="button"
            className="button button-quiet logout-button"
            onClick={cerrarSesion}
            title="Cerrar sesión"
          >
            <Icono nombre="logout" tamano={17} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-intro">
            <div>
              <p className="eyebrow">VISTA GENERAL</p>
              <h1>Monitoreo</h1>
              <p className="sidebar-description">Estado de tus dispositivos y zonas de seguridad.</p>
            </div>
            <button
              type="button"
              className="icon-button sidebar-collapse-button"
              title={detalleAbierto ? 'Ocultar detalle seleccionado' : 'Mostrar detalle seleccionado'}
              onClick={() => setDetalleAbierto((actual) => !actual)}
            >
              <Icono nombre={detalleAbierto ? 'close' : 'layers'} tamano={17} />
            </button>
          </div>

          <div className="sidebar-metrics">
            <div className="metric-tile">
              <span className="metric-label">Dispositivos</span>
              <strong>{dispositivos.length}</strong>
              <span className="metric-foot">{dispositivos.filter((d) => d.activo).length} activos</span>
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

            {detalleAbierto && dispositivoSeleccionado && (
              <section className="selected-detail">
                <div className="section-heading">
                  <span className="section-icon"><Icono nombre="device" tamano={17} /></span>
                  <h2>Dispositivo seleccionado</h2>
                </div>
                <div className="selected-detail-card">
                  <div className="selected-detail-title">
                    <span className={`status-dot ${dispositivoSeleccionado.activo ? 'is-active' : 'is-inactive'}`} />
                    <strong>{dispositivoSeleccionado.nombre}</strong>
                    <span className={`state-pill ${dispositivoSeleccionado.activo ? 'state-good' : 'state-muted'}`}>
                      {dispositivoSeleccionado.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>
                  {dispositivoSeleccionado.descripcion && (
                    <p className="detail-description">{dispositivoSeleccionado.descripcion}</p>
                  )}
                  <div className="detail-row">
                    <span>Señal GPS</span>
                    <strong className={`signal-text signal-${estadoSenal(dispositivoSeleccionado.ultima_ubicacion).tono}`}>
                      {estadoSenal(dispositivoSeleccionado.ultima_ubicacion).etiqueta}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Último registro</span>
                    <strong>{fecha(dispositivoSeleccionado.ultima_ubicacion?.registrado_en)}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Latitud</span>
                    <strong className="coordinate-value">
                      {dispositivoSeleccionado.ultima_ubicacion?.latitud ?? '—'}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Longitud</span>
                    <strong className="coordinate-value">
                      {dispositivoSeleccionado.ultima_ubicacion?.longitud ?? '—'}
                    </strong>
                  </div>
                  <div className="detail-row">
                    <span>Precisión estimada</span>
                    <strong>
                      {dispositivoSeleccionado.ultima_ubicacion?.precision_m != null
                        ? `${dispositivoSeleccionado.ultima_ubicacion.precision_m} m`
                        : 'Sin datos'}
                    </strong>
                  </div>
                  {dispositivoSeleccionado.ultima_ubicacion?.velocidad_m_s != null && (
                    <div className="detail-row">
                      <span>Velocidad</span>
                      <strong>
                        {(Number(dispositivoSeleccionado.ultima_ubicacion.velocidad_m_s) * 3.6).toFixed(1)} km/h
                      </strong>
                    </div>
                  )}
                  <button
                    type="button"
                    className="button button-outline detail-center-button"
                    onClick={() => seleccionarDispositivo(dispositivoSeleccionado)}
                  >
                    <Icono nombre="crosshair" tamano={16} />
                    Centrar en el mapa
                  </button>
                </div>
              </section>
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
                      const seleccionado = dispositivo.id === dispositivoSeleccionadoId;

                      return (
                        <button
                          type="button"
                          key={dispositivo.id}
                          className={`entity-card ${seleccionado ? 'is-selected' : ''}`}
                          onClick={() => seleccionarDispositivo(dispositivo)}
                        >
                          <span className={`entity-marker device-marker ${dispositivo.activo ? '' : 'is-inactive'}`}>
                            <Icono nombre="device" tamano={17} />
                          </span>
                          <span className="entity-main">
                            <span className="entity-title">{dispositivo.nombre}</span>
                            <span className="entity-subtitle">{senal.detalle}</span>
                            <span className="entity-meta">
                              <span className={`status-dot ${dispositivo.activo ? 'is-active' : 'is-inactive'}`} />
                              {dispositivo.activo ? 'Activo' : 'Inactivo'}
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
                      <button
                        type="button"
                        key={geocerca.id}
                        className="entity-card"
                        onClick={() => centrarGeocerca(geocerca)}
                      >
                        <span className={`entity-marker geofence-marker ${geocerca.activa ? '' : 'is-inactive'}`}>
                          <Icono nombre="fence" tamano={17} />
                        </span>
                        <span className="entity-main">
                          <span className="entity-title">{geocerca.nombre}</span>
                          <span className="entity-subtitle">Radio de {geocerca.radio_m} metros</span>
                          <span className="entity-meta">
                            <span className={`status-dot ${geocerca.activa ? 'is-active' : 'is-inactive'}`} />
                            {geocerca.activa ? 'Activa' : 'Inactiva'}
                            <span className="entity-coordinates">
                              {Number(geocerca.latitud).toFixed(5)}, {Number(geocerca.longitud).toFixed(5)}
                            </span>
                          </span>
                        </span>
                        <Icono nombre="chevron" tamano={17} />
                      </button>
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
                        <span className={`event-indicator ${evento.tipo === 'entrada' ? 'event-entry' : 'event-exit'}`} />
                        <div className="event-copy">
                          <strong>
                            {evento.tipo === 'entrada' ? 'Entrada a geocerca' : 'Salida de geocerca'}
                          </strong>
                          <span>{nombreDispositivo(evento.dispositivo_id)} · {nombreGeocerca(evento.geocerca_id)}</span>
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
          <div className="map-topline">
            <div className="map-title-block">
              <p className="eyebrow">MAPA EN DIRECTO</p>
              <h2>Ubicaciones y zonas</h2>
              <p>Consulta las últimas coordenadas registradas y el alcance de cada geocerca.</p>
            </div>
            <div className="map-status">
              <span className={`status-dot ${ultimaConsulta ? 'is-active' : 'is-inactive'}`} />
              <span>{ultimaConsulta ? 'Actualización automática activa' : 'Esperando datos'}</span>
            </div>
          </div>

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

            <div className="map-floating-controls">
              <button
                type="button"
                className="map-control-button"
                onClick={centrarMapa}
                title="Centrar el mapa en el dispositivo seleccionado"
              >
                <Icono nombre="crosshair" tamano={19} />
                <span>Centrar</span>
              </button>
            </div>

            <div className="map-legend">
              <div className="legend-heading">
                <Icono nombre="layers" tamano={16} />
                <strong>Referencias del mapa</strong>
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-device" />
                <span>Dispositivo activo</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-geofence" />
                <span>Geocerca activa</span>
              </div>
              <div className="legend-item">
                <span className="legend-dot legend-inactive" />
                <span>Elemento inactivo</span>
              </div>
            </div>

            <div className="map-bottom-status">
              <div>
                <span className="map-bottom-label">Última consulta</span>
                <strong>{fecha(ultimaConsulta)}</strong>
              </div>
              <span className="map-bottom-separator" />
              <div>
                <span className="map-bottom-label">Frecuencia de consulta</span>
                <strong>Cada 5 segundos</strong>
              </div>
            </div>
          </div>

          <div className="map-footer">
            <span>Las ubicaciones representan el último registro recibido por Supabase.</span>
            <span>Coordenadas en latitud y longitud · Hora local de Bolivia</span>
          </div>
        </section>
      </div>
    </main>
  );
}
