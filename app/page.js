'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './page.css';

import { supabase } from './lib/supabase';
import { fecha, estadoSenal } from './lib/utilidades';
import {
  crearCirculo,
  cerrarAnillo,
  crearRectangulo,
  obtenerGeometriaGeocerca,
  obtenerPuntosGeocerca,
  distanciaMetros,
  geocercasQueContienenPunto,
  calcularDimensionesGeocerca,
  etiquetaTipoGeocerca,
} from './lib/geometrias';
import {
  MAPBOX_TOKEN,
  INTERVALO_ACTUALIZACION,
  ESTILO_CLARO,
  ESTILO_OSCURO,
  agregarCapasMapa,
} from './lib/mapaConfig';

import Icono from './components/Icono';
import LoginView from './components/LoginView';
import Sidebar from './components/Sidebar';
import BarraHerramientas from './components/BarraHerramientas';
import ControlesZoom from './components/ControlesZoom';
import EditorGeocerca from './components/EditorGeocerca';

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
  const [dispositivoSeleccionadoId, setDispositivoSeleccionadoId] = useState(null);
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

  // Sincronización de tema
  useEffect(() => {
    try {
      const temaGuardado = window.localStorage.getItem('panel-gps-tema');
      if (temaGuardado === 'oscuro' || temaGuardado === 'claro') {
        setTema(temaGuardado);
      }
    } catch {}
    setTemaCargado(true);
  }, []);

  useEffect(() => {
    if (!temaCargado) return;
    try {
      window.localStorage.setItem('panel-gps-tema', tema);
    } catch {}
  }, [tema, temaCargado]);

  // Autenticación Supabase
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

  // Comprobar rol de administrador
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

  // Cargar datos
  const cargarDatos = useCallback(async ({ silencioso = false } = {}) => {
    if (!supabase || cargaEnCursoRef.current) return;

    cargaEnCursoRef.current = true;
    if (!silencioso) {
      setCargando(true);
      setError('');
    }

    try {
      const [resDisp, resGeo, resEv] = await Promise.all([
        supabase
          .from('dispositivos')
          .select('id,nombre,descripcion,creado_en,device_id')
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
          .limit(100),
      ]);

      if (resDisp.error) throw resDisp.error;
      if (resGeo.error) throw resGeo.error;
      if (resEv.error) throw resEv.error;

      const listaDisp = resDisp.data ?? [];
      const ubicacionesPromesas = await Promise.all(
        listaDisp.map(async (d) => {
          const r = await supabase
            .from('ubicaciones')
            .select(
              'id,dispositivo_id,latitud,longitud,precision_m,velocidad_m_s,rumbo_grados,registrado_en'
            )
            .eq('dispositivo_id', d.id)
            .order('registrado_en', { ascending: false })
            .limit(1)
            .maybeSingle();
          return [d.id, r.data ?? null];
        })
      );

      const mapaUbicaciones = new Map(ubicacionesPromesas);
      setDispositivos(
        listaDisp.map((d) => ({
          ...d,
          ultima_ubicacion: mapaUbicaciones.get(d.id),
        }))
      );
      setGeocercas(resGeo.data ?? []);
      setEventos(resEv.data ?? []);
      setUltimaConsulta(new Date().toISOString());
    } catch (err) {
      setError('Error al sincronizar datos: ' + (err?.message ?? ''));
    } finally {
      cargaEnCursoRef.current = false;
      if (!silencioso) setCargando(false);
    }
  }, []);

  // Polling automático cada 5s
  useEffect(() => {
    if (rol !== 'admin') return;
    cargarDatos({ silencioso: false });
    const intervalo = window.setInterval(() => {
      cargarDatos({ silencioso: true });
    }, INTERVALO_ACTUALIZACION);
    return () => window.clearInterval(intervalo);
  }, [rol, cargarDatos]);

  // Enriquecer datos con ocupantes y ubicaciones dentro de zonas
  const dispositivosEnriquecidos = useMemo(() => {
    return dispositivos.map((disp) => {
      const u = disp.ultima_ubicacion;
      const dentroDe = u
        ? geocercasQueContienenPunto(u.latitud, u.longitud, geocercas)
        : [];
      return { ...disp, geocercasActuales: dentroDe };
    });
  }, [dispositivos, geocercas]);

  const geocercasEnriquecidas = useMemo(() => {
    return geocercas.map((geo) => {
      const ocupantes = dispositivosEnriquecidos
        .filter((d) => d.geocercasActuales?.some((g) => g.id === geo.id))
        .map((d) => d.nombre);
      return { ...geo, dispositivosDentro: ocupantes };
    });
  }, [geocercas, dispositivosEnriquecidos]);

  // Ref para acceder a geocercas enriquecidas en eventos de Mapbox sin cierres obsoletos
  const geocercasRef = useRef([]);
  useEffect(() => {
    geocercasRef.current = geocercasEnriquecidas;
  }, [geocercasEnriquecidas]);

  // Trazar línea punteada del recorrido del dispositivo seleccionado
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo || !dispositivoSeleccionadoId || !supabase) return;

    supabase
      .from('ubicaciones')
      .select('longitud,latitud')
      .eq('dispositivo_id', dispositivoSeleccionadoId)
      .order('registrado_en', { ascending: true })
      .limit(30)
      .then(({ data }) => {
        const coords = (data || [])
          .map((u) => [Number(u.longitud), Number(u.latitud)])
          .filter((p) => p.every(Number.isFinite));

        mapa.getSource('recorrido-dispositivo')?.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: coords },
        });
      });
  }, [dispositivoSeleccionadoId, mapaListo, ultimaConsulta]);

  // Inicialización de Mapbox
  useEffect(() => {
    if (rol !== 'admin' || !MAPBOX_TOKEN || !mapaContenedor.current || mapaRef.current) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    const estiloInicial = tema === 'oscuro' ? ESTILO_OSCURO : ESTILO_CLARO;
    mapaEstiloRef.current = estiloInicial;

    const mapa = new mapboxgl.Map({
      container: mapaContenedor.current,
      style: estiloInicial,
      center: [-68.1193, -16.4897],
      zoom: 13,
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
            ? 'Centro fijado. Ajusta el radio y guarda.'
            : herramienta.tipo === 'rectangulo'
            ? siguientes.length < 2
              ? 'Haz clic en la esquina opuesta.'
              : 'Rectángulo trazado. Puedes guardarlo.'
            : `${siguientes.length} punto(s) marcados.`
        );
        return;
      }

      // 1. Clic en dispositivo: abrir popup y seleccionar para trazar su ruta
      if (mapa.getLayer('dispositivos-puntos')) {
        const elementos = mapa.queryRenderedFeatures(evento.point, {
          layers: ['dispositivos-puntos'],
        });
        if (elementos.length > 0) {
          const prop = elementos[0].properties;
          setDispositivoSeleccionadoId(prop.id);

          const contenido = document.createElement('div');
          contenido.className = 'map-popup-content';
          contenido.innerHTML = `
            <strong>${prop.nombre || 'Dispositivo'}</strong>
            <p>${prop.enLinea ? 'En línea' : 'Inactivo / sin señal'}</p>
            ${prop.fecha ? `<p>Última: ${prop.fecha}</p>` : ''}
          `;
          new mapboxgl.Popup({ offset: 12, closeButton: true })
            .setLngLat(elementos[0].geometry.coordinates.slice())
            .setDOMContent(contenido)
            .addTo(mapa);
          return;
        }
      }

      // 2. Clic en Geocerca: popup con dimensiones y ocupantes
      const capasGeocerca = ['geocercas-relleno', 'geocercas-borde'].filter((id) =>
        mapa.getLayer(id)
      );
      if (capasGeocerca.length > 0) {
        const elementosGeo = mapa.queryRenderedFeatures(evento.point, {
          layers: capasGeocerca,
        });
        if (elementosGeo.length > 0) {
          const idGeo = elementosGeo[0].properties?.id;
          const geo = geocercasRef.current.find((g) => g.id === idGeo);
          if (geo) {
            const dims = calcularDimensionesGeocerca(geo);
            const dimTexto = dims.area
              ? `Área: ${dims.area}`
              : dims.longitud
              ? `Longitud: ${dims.longitud}`
              : dims.radio
              ? `Radio: ${dims.radio}`
              : '';
            const dentro =
              geo.dispositivosDentro?.length > 0
                ? geo.dispositivosDentro.join(', ')
                : 'Ninguno';

            new mapboxgl.Popup({ offset: 10, closeButton: true })
              .setLngLat(evento.lngLat)
              .setHTML(`
                <div class="map-popup-content">
                  <strong>${geo.nombre}</strong>
                  <p>${etiquetaTipoGeocerca(geo)} ${dimTexto ? `· ${dimTexto}` : ''}</p>
                  <p><strong>Dentro:</strong> ${dentro}</p>
                </div>
              `)
              .addTo(mapa);
          }
        }
      }
    });

    let indiceVertice = null;
    let arrastrando = false;
    let inicio = null;
    let base = null;

    mapa.on('mousedown', (evento) => {
      if (herramientaDibujoRef.current || !puntosDibujoRef.current.length) return;
      const vert = mapa.getLayer('geocerca-borrador-vertices')
        ? mapa.queryRenderedFeatures(evento.point, { layers: ['geocerca-borrador-vertices'] })[0]
        : null;
      const idx = Number(vert?.properties?.indice);
      if (Number.isInteger(idx) && idx >= 0) {
        indiceVertice = idx;
        mapa.dragPan.disable();
        mapa.getCanvas().style.cursor = 'grabbing';
        evento.preventDefault();
        return;
      }

      const capas = ['geocerca-borrador-relleno', 'geocerca-borrador-linea'].filter((id) =>
        mapa.getLayer(id)
      );
      const forma = capas.length
        ? mapa.queryRenderedFeatures(evento.point, { layers: capas })[0]
        : null;
      if (forma) {
        arrastrando = true;
        inicio = [evento.lngLat.lng, evento.lngLat.lat];
        base = puntosDibujoRef.current.map((p) => [...p]);
        mapa.dragPan.disable();
        mapa.getCanvas().style.cursor = 'move';
        evento.preventDefault();
      }
    });

    mapa.on('mousemove', (evento) => {
      if (indiceVertice !== null) {
        const nuevos = puntosDibujoRef.current.map((p) => [...p]);
        if (nuevos[indiceVertice]) {
          nuevos[indiceVertice] = [evento.lngLat.lng, evento.lngLat.lat];
          puntosDibujoRef.current = nuevos;
          setPuntosDibujo(nuevos);
          setDibujoFinalizado(true);
        }
        return;
      }

      if (arrastrando && inicio && base) {
        const dLon = evento.lngLat.lng - inicio[0];
        const dLat = evento.lngLat.lat - inicio[1];
        const nuevos = base.map((p) => [p[0] + dLon, p[1] + dLat]);
        puntosDibujoRef.current = nuevos;
        setPuntosDibujo(nuevos);
        setDibujoFinalizado(true);
        return;
      }

      if (herramientaDibujoRef.current) {
        mapa.getCanvas().style.cursor = 'crosshair';
        return;
      }

      const sobreElemento = mapa.queryRenderedFeatures(evento.point, {
        layers: ['dispositivos-puntos', 'geocercas-relleno'].filter((id) =>
          mapa.getLayer(id)
        ),
      });
      mapa.getCanvas().style.cursor = sobreElemento.length ? 'pointer' : '';
    });

    const finArrastre = () => {
      if (indiceVertice !== null || arrastrando) {
        indiceVertice = null;
        arrastrando = false;
        inicio = null;
        base = null;
        mapa.dragPan.enable();
        mapa.getCanvas().style.cursor = '';
      }
    };

    mapa.on('mouseup', finArrastre);
    mapa.on('mouseleave', finArrastre);

    return () => {
      mapa.remove();
      mapaRef.current = null;
      mapaEstiloRef.current = '';
      mapaEnfocadoRef.current = false;
      setMapaListo(false);
    };
  }, [rol]);

  // Actualización de estilo de mapa
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !mapaListo) return;
    const estiloDeseado = tema === 'oscuro' ? ESTILO_OSCURO : ESTILO_CLARO;
    if (mapaEstiloRef.current === estiloDeseado) return;

    mapaEstiloRef.current = estiloDeseado;
    setMapaListo(false);
    mapa.setStyle(estiloDeseado);
  }, [tema, mapaListo]);

  // Actualizar datos de fuentes en Mapbox
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapaListo || !mapa) return;

    const puntosDisp = dispositivosEnriquecidos
      .filter((d) => d.ultima_ubicacion?.latitud && d.ultima_ubicacion?.longitud)
      .map((d) => ({
        type: 'Feature',
        properties: {
          id: d.id,
          nombre: d.nombre,
          activo: estadoSenal(d.ultima_ubicacion).enLinea,
          enLinea: estadoSenal(d.ultima_ubicacion).enLinea,
          fecha: fecha(d.ultima_ubicacion.registrado_en),
        },
        geometry: {
          type: 'Point',
          coordinates: [
            Number(d.ultima_ubicacion.longitud),
            Number(d.ultima_ubicacion.latitud),
          ],
        },
      }));

    const formasGeo = geocercasEnriquecidas
      .map((g) => {
        const geometry = obtenerGeometriaGeocerca(g);
        if (!geometry) return null;
        return {
          type: 'Feature',
          properties: { id: g.id, nombre: g.nombre, activa: g.activa, tipo: g.tipo },
          geometry,
        };
      })
      .filter(Boolean);

    mapa.getSource('dispositivos')?.setData({
      type: 'FeatureCollection',
      features: puntosDisp,
    });

    mapa.getSource('geocercas')?.setData({
      type: 'FeatureCollection',
      features: formasGeo,
    });

    if (!mapaEnfocadoRef.current && puntosDisp.length > 0) {
      mapa.flyTo({ center: puntosDisp[0].geometry.coordinates, zoom: 15, duration: 800 });
      mapaEnfocadoRef.current = true;
    }
  }, [mapaListo, dispositivosEnriquecidos, geocercasEnriquecidas]);

  // Borrador de dibujo interactivo
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
        geometria =
          puntos.length >= 3
            ? { type: 'Polygon', coordinates: [cerrarAnillo(puntos)] }
            : puntos.length >= 2
            ? { type: 'LineString', coordinates: puntos }
            : null;
      } else if (tipoGeocerca === 'linea' && puntos.length >= 2) {
        geometria = { type: 'LineString', coordinates: puntos };
      }

      if (geometria) {
        features.push({
          type: 'Feature',
          properties: { borrador: true },
          geometry,
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

  // Acciones sobre el mapa
  function centrarDispositivo(disp) {
    setDispositivoSeleccionadoId(disp.id);
    const u = disp?.ultima_ubicacion;
    if (!mapaRef.current || !u?.latitud || !u?.longitud) return;
    mapaRef.current.flyTo({
      center: [Number(u.longitud), Number(u.latitud)],
      zoom: 16,
      duration: 800,
    });
  }

  function centrarGeocerca(geo) {
    if (!mapaRef.current) return;
    const puntos = obtenerPuntosGeocerca(geo).map((p) => [Number(p[0]), Number(p[1])]);
    const validos = puntos.filter((p) => p.length === 2 && p.every(Number.isFinite));
    if (!validos.length) return;

    if (validos.length === 1) {
      mapaRef.current.flyTo({ center: validos[0], zoom: 15, duration: 800 });
      return;
    }
    const limites = new mapboxgl.LngLatBounds();
    validos.forEach((p) => limites.extend(p));
    mapaRef.current.fitBounds(limites, { padding: 90, maxZoom: 16, duration: 800 });
  }

  function centrarMapa() {
    if (!mapaRef.current) return;
    const puntos = [
      ...dispositivos
        .map((d) => d.ultima_ubicacion)
        .filter((u) => u?.longitud && u?.latitud)
        .map((u) => [Number(u.longitud), Number(u.latitud)]),
    ];
    if (puntos.length > 0) {
      mapaRef.current.flyTo({ center: puntos[0], zoom: 15, duration: 800 });
    } else {
      mapaRef.current.flyTo({ center: [-68.1193, -16.4897], zoom: 12, duration: 800 });
    }
  }

  // Operaciones de dibujo y guardado
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
    setMensajeDibujo('Elige una figura y comienza a marcar sobre el mapa.');
    setEditorGeocercaAbierto(true);
  }

  function editarGeocerca(geo) {
    const puntos =
      geo.tipo === 'circulo'
        ? [[Number(geo.longitud), Number(geo.latitud)]]
        : obtenerPuntosGeocerca(geo).map((p) => [Number(p[0]), Number(p[1])]);
    const puntosSinCierre =
      geo.tipo === 'poligono' &&
      puntos.length > 1 &&
      puntos[0][0] === puntos[puntos.length - 1][0] &&
      puntos[0][1] === puntos[puntos.length - 1][1]
        ? puntos.slice(0, -1)
        : puntos;

    herramientaDibujoRef.current = null;
    puntosDibujoRef.current = puntosSinCierre;
    setPuntosDibujo(puntosSinCierre);
    setTipoGeocerca(
      geo.tipo === 'circulo'
        ? 'circulo'
        : geo.tipo === 'linea'
        ? 'linea'
        : geo.geometria?.forma === 'rectangulo'
        ? 'rectangulo'
        : 'poligono'
    );
    setNombreGeocerca(geo.nombre ?? '');
    setDescripcionGeocerca(geo.descripcion ?? '');
    setRadioGeocerca(String(geo.radio_m ?? 150));
    setGeocercaEditando(geo.id);
    setModoDibujo(false);
    setDibujoFinalizado(true);
    setMensajeDibujo('Ajusta los vértices o arrastra para reubicar la zona.');
    setEditorGeocercaAbierto(true);
    centrarGeocerca(geo);
  }

  function iniciarDibujo(tipoForzado = tipoGeocerca) {
    if (!mapaRef.current || !mapaListo) return;
    setTipoGeocerca(tipoForzado);
    herramientaDibujoRef.current = { tipo: tipoForzado };
    puntosDibujoRef.current = [];
    setPuntosDibujo([]);
    setModoDibujo(true);
    setDibujoFinalizado(false);
    setMensajeDibujo(
      tipoForzado === 'circulo'
        ? 'Haz clic en el mapa para fijar el centro del círculo.'
        : tipoForzado === 'rectangulo'
        ? 'Haz clic en dos esquinas opuestas del rectángulo.'
        : tipoForzado === 'linea'
        ? 'Haz clic a lo largo de la calle para trazar la línea.'
        : 'Haz clic en cada esquina de la cuadra o polígono.'
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
    const minimo =
      tipoGeocerca === 'circulo' ? 1 : tipoGeocerca === 'rectangulo' ? 2 : tipoGeocerca === 'linea' ? 2 : 3;

    if (cantidad < minimo) {
      setMensajeDibujo(`Se requieren al menos ${minimo} punto(s) para esta figura.`);
      return;
    }

    herramientaDibujoRef.current = null;
    setModoDibujo(false);
    setDibujoFinalizado(true);
    if (mapaRef.current) mapaRef.current.getCanvas().style.cursor = '';
    setMensajeDibujo('Dibujo completado. Revisa y guarda en Supabase.');
  }

  function deshacerPunto() {
    const nuevos = puntosDibujoRef.current.slice(0, -1);
    puntosDibujoRef.current = nuevos;
    setPuntosDibujo(nuevos);
    const minimo =
      tipoGeocerca === 'circulo' ? 1 : tipoGeocerca === 'rectangulo' ? 2 : tipoGeocerca === 'linea' ? 2 : 3;
    setDibujoFinalizado(!modoDibujo && nuevos.length >= minimo);
    setMensajeDibujo(nuevos.length ? `${nuevos.length} punto(s) restantes.` : 'Sin puntos.');
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
      setMensajeDibujo('Primero finaliza el trazo antes de guardar.');
      return;
    }

    const puntos = puntosDibujoRef.current.map((p) => [Number(p[0]), Number(p[1])]);
    const minimo =
      tipoGeocerca === 'circulo' ? 1 : tipoGeocerca === 'rectangulo' ? 2 : tipoGeocerca === 'linea' ? 2 : 3;

    if (puntos.length < minimo) {
      setMensajeDibujo(`Se necesitan al menos ${minimo} punto(s).`);
      return;
    }

    let tipoDb = 'poligono';
    let geometria = null;
    let latitud;
    let longitud;
    let radio_m = null;

    if (tipoGeocerca === 'circulo') {
      tipoDb = 'circulo';
      latitud = puntos[0][1];
      longitud = puntos[0][0];
      radio_m = Math.round(Number(radioGeocerca));
    } else {
      const puntosCentro = tipoGeocerca === 'rectangulo' ? [puntos[0], puntos[1]] : puntos;
      longitud = puntosCentro.reduce((s, p) => s + p[0], 0) / puntosCentro.length;
      latitud = puntosCentro.reduce((s, p) => s + p[1], 0) / puntosCentro.length;

      if (tipoGeocerca === 'linea') {
        tipoDb = 'linea';
        geometria = { type: 'LineString', coordinates: puntos };
      } else if (tipoGeocerca === 'rectangulo') {
        geometria = { ...crearRectangulo(puntos[0], puntos[1]), forma: 'rectangulo' };
      } else {
        geometria = { type: 'Polygon', coordinates: [cerrarAnillo(puntos)] };
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
        respuesta = await supabase
          .from('geocercas')
          .update(datos)
          .eq('id', geocercaEditando)
          .select('id,propietario_id,nombre,descripcion,latitud,longitud,radio_m,activa,tipo,geometria,creado_en')
          .single();
      } else {
        const {
          data: { user: usuarioAuth },
        } = await supabase.auth.getUser();
        if (!usuarioAuth) throw new Error('No hay usuario autenticado.');

        respuesta = await supabase
          .from('geocercas')
          .insert({ ...datos, propietario_id: usuarioAuth.id, activa: true })
          .select('id,propietario_id,nombre,descripcion,latitud,longitud,radio_m,activa,tipo,geometria,creado_en')
          .single();
      }

      if (respuesta.error) throw respuesta.error;

      setGeocercas((actuales) =>
        geocercaEditando
          ? actuales.map((g) => (g.id === geocercaEditando ? respuesta.data : g))
          : [respuesta.data, ...actuales]
      );

      cancelarEditor();
    } catch (err) {
      setMensajeDibujo('Error al guardar: ' + (err?.message ?? 'Error desconocido.'));
    } finally {
      setGuardandoGeocerca(false);
    }
  }

  async function cambiarEstadoGeocerca(geo) {
    const { data, error: err } = await supabase
      .from('geocercas')
      .update({ activa: !geo.activa })
      .eq('id', geo.id)
      .select('id,activa')
      .single();
    if (err) {
      setError('No se pudo cambiar el estado: ' + err.message);
      return;
    }
    setGeocercas((actuales) =>
      actuales.map((g) => (g.id === geo.id ? { ...g, activa: data.activa } : g))
    );
  }

  async function eliminarGeocerca(geo) {
    if (!window.confirm(`¿Eliminar la geocerca "${geo.nombre}"?`)) return;
    const { error: err } = await supabase.from('geocercas').delete().eq('id', geo.id);
    if (err) {
      setError('No se pudo eliminar: ' + err.message);
      return;
    }
    setGeocercas((actuales) => actuales.filter((g) => g.id !== geo.id));
  }

  async function iniciarSesion(evento) {
    evento.preventDefault();
    if (!supabase) return;
    setError('');
    const { error: err } = await supabase.auth.signInWithPassword({
      email: correo,
      password: contrasena,
    });
    if (err) setError('Credenciales incorrectas: ' + err.message);
  }

  async function cerrarSesion() {
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  // Filtrado de búsquedas
  const dispositivosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLocaleLowerCase('es');
    return dispositivosEnriquecidos.filter(
      (d) =>
        !t ||
        (d.nombre ?? '').toLocaleLowerCase('es').includes(t) ||
        (d.descripcion ?? '').toLocaleLowerCase('es').includes(t)
    );
  }, [dispositivosEnriquecidos, busqueda]);

  const geocercasFiltradas = useMemo(() => {
    const t = busqueda.trim().toLocaleLowerCase('es');
    return geocercasEnriquecidas.filter(
      (g) =>
        !t ||
        (g.nombre ?? '').toLocaleLowerCase('es').includes(t) ||
        (g.descripcion ?? '').toLocaleLowerCase('es').includes(t)
    );
  }, [geocercasEnriquecidas, busqueda]);

  const eventosFiltrados = useMemo(() => {
    const t = busqueda.trim().toLocaleLowerCase('es');
    return eventos.filter((ev) => {
      if (!t) return true;
      const d = dispositivos.find((disp) => disp.id === ev.dispositivo_id);
      const g = geocercas.find((geo) => geo.id === ev.geocerca_id);
      return [ev.tipo, d?.nombre, g?.nombre].some((val) =>
        (val ?? '').toLocaleLowerCase('es').includes(t)
      );
    });
  }, [eventos, dispositivos, geocercas, busqueda]);

  if (!sesionLista || !usuario || verificandoRol || rol !== 'admin') {
    return (
      <LoginView
        sesionLista={sesionLista}
        usuario={usuario}
        verificandoRol={verificandoRol}
        rol={rol}
        tema={tema}
        correo={correo}
        setCorreo={setCorreo}
        contrasena={contrasena}
        setContrasena={setContrasena}
        iniciarSesion={iniciarSesion}
        cerrarSesion={cerrarSesion}
        error={error}
      />
    );
  }

  return (
    <main className={`gps-app theme-${tema}`}>
      <div className="workspace">
        <Sidebar
          tema={tema}
          setTema={setTema}
          cargarDatos={cargarDatos}
          cargando={cargando}
          ultimaConsulta={ultimaConsulta}
          dispositivos={dispositivosFiltrados}
          geocercas={geocercasFiltradas}
          eventos={eventosFiltrados}
          busqueda={busqueda}
          setBusqueda={setBusqueda}
          seccionLateral={seccionLateral}
          setSeccionLateral={setSeccionLateral}
          error={error}
          centrarDispositivo={centrarDispositivo}
          centrarGeocerca={centrarGeocerca}
          editarGeocerca={editarGeocerca}
          cambiarEstadoGeocerca={cambiarEstadoGeocerca}
          eliminarGeocerca={eliminarGeocerca}
          usuario={usuario}
          cerrarSesion={cerrarSesion}
        />

        <section className="map-workspace" aria-label="Mapa de seguimiento">
          <div className="map-frame">
            {!MAPBOX_TOKEN ? (
              <div className="map-message">
                <div className="map-message-symbol">
                  <Icono nombre="pin" tamano={27} />
                </div>
                <h3>Falta la clave de Mapbox</h3>
                <p>Añade NEXT_PUBLIC_MAPBOX_TOKEN en tu archivo .env.local.</p>
              </div>
            ) : (
              <div ref={mapaContenedor} className="map-canvas" />
            )}

            {/* Barra flotante de herramientas de dibujo en la esquina superior derecha */}
            <BarraHerramientas
              editorGeocercaAbierto={editorGeocercaAbierto}
              tipoGeocerca={tipoGeocerca}
              activarHerramientaGeocerca={activarHerramientaGeocerca}
              geocercaEditando={geocercaEditando}
            />

            {/* Controles de navegación en la esquina inferior derecha */}
            <ControlesZoom
              acercarMapa={() => mapaRef.current?.zoomIn({ duration: 180 })}
              alejarMapa={() => mapaRef.current?.zoomOut({ duration: 180 })}
              centrarMapa={centrarMapa}
            />

            {/* Editor de geocercas flotante */}
            <EditorGeocerca
              editorGeocercaAbierto={editorGeocercaAbierto}
              geocercaEditando={geocercaEditando}
              cancelarEditor={cancelarEditor}
              nombreGeocerca={nombreGeocerca}
              setNombreGeocerca={setNombreGeocerca}
              descripcionGeocerca={descripcionGeocerca}
              setDescripcionGeocerca={setDescripcionGeocerca}
              tipoGeocerca={tipoGeocerca}
              radioGeocerca={radioGeocerca}
              setRadioGeocerca={setRadioGeocerca}
              dibujoFinalizado={dibujoFinalizado}
              puntosDibujo={puntosDibujo}
              mensajeDibujo={mensajeDibujo}
              deshacerPunto={deshacerPunto}
              terminarDibujo={terminarDibujo}
              modoDibujo={modoDibujo}
              guardarGeocerca={guardarGeocerca}
              guardandoGeocerca={guardandoGeocerca}
            />
          </div>
        </section>
      </div>
    </main>
  );
}