
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { supabase } from './lib/supabase';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

function fecha(valor) {
  if (!valor) return 'Sin datos';

  return new Date(valor).toLocaleString('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
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

export default function Home() {
  const mapaContenedor = useRef(null);
  const mapaRef = useRef(null);

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [usuario, setUsuario] = useState(null);
  const [rol, setRol] = useState(null);
  const [sesionLista, setSesionLista] = useState(false);
  const [verificandoRol, setVerificandoRol] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mapaListo, setMapaListo] = useState(false);

  const [dispositivos, setDispositivos] = useState([]);
  const [geocercas, setGeocercas] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');

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

    const { data } = supabase.auth.onAuthStateChange(
      (_evento, sesion) => {
        setUsuario(sesion?.user ?? null);
        setSesionLista(true);
        setError('');
      }
    );

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

  const cargarDatos = useCallback(async () => {
    if (!supabase) return;

    setCargando(true);
    setError('');

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

      if (respuestaDispositivos.error) {
        throw respuestaDispositivos.error;
      }

      if (respuestaGeocercas.error) {
        throw respuestaGeocercas.error;
      }

      if (respuestaEventos.error) {
        throw respuestaEventos.error;
      }

      const listaDispositivos = respuestaDispositivos.data ?? [];

      const resultadosUbicaciones = await Promise.all(
        listaDispositivos.map(async (dispositivo) => {
          const respuesta = await supabase
            .from('ubicaciones')
            .select(
              'id,dispositivo_id,latitud,longitud,precision_m,registrado_en'
            )
            .eq('dispositivo_id', dispositivo.id)
            .order('registrado_en', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (respuesta.error) throw respuesta.error;

          return [dispositivo.id, respuesta.data];
        })
      );

      const ubicacionesPorDispositivo = new Map(
        resultadosUbicaciones
      );

      setDispositivos(
        listaDispositivos.map((dispositivo) => ({
          ...dispositivo,
          ultima_ubicacion: ubicacionesPorDispositivo.get(dispositivo.id),
        }))
      );

      setGeocercas(respuestaGeocercas.data ?? []);
      setEventos(respuestaEventos.data ?? []);
    } catch (err) {
      setError(
        'No se pudieron cargar los datos. Comprueba las políticas RLS y los permisos de administrador. ' +
        (err.message ?? '')
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (rol === 'admin') cargarDatos();
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

    const mapa = new mapboxgl.Map({
      container: mapaContenedor.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-68.1193, -16.4897],
      zoom: 11,
    });

    mapaRef.current = mapa;
    mapa.addControl(new mapboxgl.NavigationControl());

    mapa.on('load', () => {
      mapa.addSource('geocercas', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

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

      mapa.addSource('dispositivos', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      mapa.addLayer({
        id: 'dispositivos-puntos',
        type: 'circle',
        source: 'dispositivos',
        paint: {
          'circle-radius': 7,
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

      mapa.on('click', 'dispositivos-puntos', (evento) => {
        const propiedades = evento.features?.[0]?.properties;
        if (!propiedades) return;

        const contenido = document.createElement('div');
        const titulo = document.createElement('strong');
        titulo.textContent = propiedades.nombre || 'Dispositivo';
        contenido.appendChild(titulo);

        const estado = document.createElement('p');
        estado.textContent =
          String(propiedades.activo) === 'true' ? 'Activo' : 'Inactivo';
        contenido.appendChild(estado);

        if (propiedades.fecha) {
          const ultima = document.createElement('p');
          ultima.textContent = 'Última ubicación: ' + propiedades.fecha;
          contenido.appendChild(ultima);
        }

        new mapboxgl.Popup()
          .setLngLat(evento.lngLat)
          .setDOMContent(contenido)
          .addTo(mapa);
      });

      mapa.on('mouseenter', 'dispositivos-puntos', () => {
        mapa.getCanvas().style.cursor = 'pointer';
      });

      mapa.on('mouseleave', 'dispositivos-puntos', () => {
        mapa.getCanvas().style.cursor = '';
      });

      setMapaListo(true);
    });

    mapa.on('error', (evento) => {
      console.error('Error de Mapbox:', evento.error);
    });

    return () => {
      mapa.remove();
      mapaRef.current = null;
      setMapaListo(false);
    };
  }, [rol]);

  useEffect(() => {
    const mapa = mapaRef.current;

    if (!mapaListo || !mapa) return;

    const puntosDispositivos = dispositivos
      .filter((d) => {
        const u = d.ultima_ubicacion;
        return u &&
          Number.isFinite(Number(u.latitud)) &&
          Number.isFinite(Number(u.longitud));
      })
      .map((d) => ({
        type: 'Feature',
        properties: {
          id: d.id,
          nombre: d.nombre,
          activo: d.activo,
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

    const circulosGeocercas = geocercas
      .filter((g) =>
        Number.isFinite(Number(g.latitud)) &&
        Number.isFinite(Number(g.longitud)) &&
        Number(g.radio_m) > 0
      )
      .map((g) => ({
        ...crearCirculo(g.latitud, g.longitud, g.radio_m),
        properties: {
          id: g.id,
          nombre: g.nombre,
          activa: g.activa,
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

    const puntos = [
      ...puntosDispositivos.map((f) => f.geometry.coordinates),
      ...geocercas
        .filter((g) => g.activa)
        .map((g) => [Number(g.longitud), Number(g.latitud)])
        .filter((p) => p.every(Number.isFinite)),
    ];

    if (puntos.length === 1) {
      mapa.flyTo({ center: puntos[0], zoom: 14, duration: 0 });
    } else if (puntos.length > 1) {
      const limites = new mapboxgl.LngLatBounds();
      puntos.forEach((punto) => limites.extend(punto));
      mapa.fitBounds(limites, {
        padding: 60,
        maxZoom: 14,
        duration: 0,
      });
    }
  }, [mapaListo, dispositivos, geocercas]);

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
    dispositivos.find((d) => d.id === id)?.nombre ?? id;

  const nombreGeocerca = (id) =>
    geocercas.find((g) => g.id === id)?.nombre ?? id;

  if (!sesionLista) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        Comprobando sesión...
      </main>
    );
  }

  if (!usuario) {
    return (
      <main className="min-h-screen bg-slate-100 flex items-center justify-center p-5">
        <section className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
          <div className="mb-6 text-center">
            <div className="text-4xl">📍</div>
            <h1 className="mt-3 text-3xl font-bold text-slate-900">
              Panel GPS
            </h1>
            <p className="mt-2 text-slate-500">
              Administración de dispositivos y geocercas
            </p>
          </div>

          <form onSubmit={iniciarSesion} className="space-y-4">
            <div>
              <label htmlFor="correo" className="mb-1 block text-sm font-medium">
                Correo electrónico
              </label>
              <input
                id="correo"
                type="email"
                required
                autoComplete="email"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>

            <div>
              <label
                htmlFor="contrasena"
                className="mb-1 block text-sm font-medium"
              >
                Contraseña
              </label>
              <input
                id="contrasena"
                type="password"
                required
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => setContrasena(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-3"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-blue-700 p-3 font-semibold text-white hover:bg-blue-800"
            >
              Iniciar sesión
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <p className="mt-5 text-xs text-slate-500">
            Solo las cuentas autorizadas como administradoras pueden acceder
            al panel.
          </p>
        </section>
      </main>
    );
  }

  if (verificandoRol) {
    return (
      <main className="min-h-screen grid place-items-center p-6">
        Verificando permisos de administrador...
      </main>
    );
  }

  if (rol !== 'admin') {
    return (
      <main className="min-h-screen bg-slate-100 grid place-items-center p-6">
        <section className="max-w-lg rounded-2xl bg-white p-8 text-center shadow">
          <h1 className="text-2xl font-bold">Acceso restringido</h1>
          <p className="mt-3 text-slate-600">
            Esta cuenta no tiene permisos de administrador.
          </p>
          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
          <button
            onClick={cerrarSesion}
            className="mt-6 rounded-lg bg-slate-900 px-5 py-3 text-white"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900">
      <header className="bg-slate-950 px-5 py-5 text-white md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Panel GPS Admin</h1>
            <p className="mt-1 text-sm text-slate-300">
              Monitoreo de dispositivos y geocercas
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm text-slate-300">{usuario.email}</span>
            <button
              onClick={cargarDatos}
              disabled={cargando}
              className="rounded-lg bg-blue-600 px-4 py-2 font-medium hover:bg-blue-500 disabled:opacity-50"
            >
              {cargando ? 'Actualizando...' : 'Actualizar'}
            </button>
            <button
              onClick={cerrarSesion}
              className="rounded-lg border border-slate-500 px-4 py-2 hover:bg-slate-800"
            >
              Salir
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 p-5 md:p-8">
        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
            {error}
          </div>
        )}

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Dispositivos</p>
            <p className="mt-2 text-3xl font-bold">{dispositivos.length}</p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Dispositivos activos</p>
            <p className="mt-2 text-3xl font-bold">
              {dispositivos.filter((d) => d.activo).length}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Geocercas activas</p>
            <p className="mt-2 text-3xl font-bold">
              {geocercas.filter((g) => g.activa).length}
            </p>
          </div>

          <div className="rounded-xl bg-white p-5 shadow-sm">
            <p className="text-sm text-slate-500">Eventos recientes</p>
            <p className="mt-2 text-3xl font-bold">{eventos.length}</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold">Mapa en tiempo real de consulta</h2>
            <p className="mt-1 text-sm text-slate-500">
              Muestra la última ubicación guardada de cada dispositivo.
            </p>
          </div>

          {!MAPBOX_TOKEN ? (
            <div className="p-8 text-red-700">
              Falta NEXT_PUBLIC_MAPBOX_TOKEN en .env.local.
            </div>
          ) : (
            <div ref={mapaContenedor} className="h-[460px] w-full" />
          )}

          <div className="flex flex-wrap gap-5 border-t p-4 text-sm text-slate-600">
            <span>🔵 Dispositivo activo</span>
            <span>🟢 Geocerca activa</span>
            <span>⚪ Elemento inactivo</span>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold">Dispositivos</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-4">Nombre</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Última ubicación</th>
                  <th className="p-4">Coordenadas</th>
                </tr>
              </thead>
              <tbody>
                {dispositivos.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="p-4 font-medium">{d.nombre}</td>
                    <td className="p-4">
                      {d.activo ? 'Activo' : 'Inactivo'}
                    </td>
                    <td className="p-4">
                      {fecha(d.ultima_ubicacion?.registrado_en)}
                    </td>
                    <td className="p-4">
                      {d.ultima_ubicacion
                        ? `${d.ultima_ubicacion.latitud}, ${d.ultima_ubicacion.longitud}`
                        : 'Sin ubicaciones'}
                    </td>
                  </tr>
                ))}

                {dispositivos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      No hay dispositivos disponibles.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold">Geocercas</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-4">Nombre</th>
                  <th className="p-4">Radio</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Centro</th>
                </tr>
              </thead>
              <tbody>
                {geocercas.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="p-4 font-medium">{g.nombre}</td>
                    <td className="p-4">{g.radio_m} m</td>
                    <td className="p-4">{g.activa ? 'Activa' : 'Inactiva'}</td>
                    <td className="p-4">{g.latitud}, {g.longitud}</td>
                  </tr>
                ))}

                {geocercas.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      No hay geocercas disponibles.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl bg-white shadow-sm">
          <div className="border-b p-5">
            <h2 className="text-xl font-bold">Historial de eventos</h2>
            <p className="mt-1 text-sm text-slate-500">
              Últimos 50 eventos registrados por Supabase.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="p-4">Tipo</th>
                  <th className="p-4">Dispositivo</th>
                  <th className="p-4">Geocerca</th>
                  <th className="p-4">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr key={e.id} className="border-t">
                    <td className="p-4">
                      <span
                        className={
                          'rounded-full px-3 py-1 font-medium ' +
                          (e.tipo === 'entrada'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-orange-100 text-orange-800')
                        }
                      >
                        {e.tipo}
                      </span>
                    </td>
                    <td className="p-4">
                      {nombreDispositivo(e.dispositivo_id)}
                    </td>
                    <td className="p-4">
                      {nombreGeocerca(e.geocerca_id)}
                    </td>
                    <td className="p-4">{fecha(e.ocurrido_en)}</td>
                  </tr>
                ))}

                {eventos.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-slate-500">
                      No hay eventos registrados.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <p className="pb-4 text-center text-xs text-slate-500">
          Las ubicaciones y eventos dependen de los permisos RLS de Supabase.
          El botón Actualizar vuelve a consultar los datos.
        </p>
      </div>
    </main>
  );
}
