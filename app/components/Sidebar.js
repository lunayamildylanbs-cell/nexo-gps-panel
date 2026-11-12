import { useState } from 'react';
import Icono from './Icono';
import { fecha, horaCorta, estadoSenal } from '../lib/utilidades';
import { etiquetaTipoGeocerca, calcularDimensionesGeocerca } from '../lib/geometrias';

export default function Sidebar({
  tema,
  setTema,
  cargarDatos,
  cargando,
  ultimaConsulta,
  dispositivos,
  geocercas,
  eventos,
  busqueda,
  setBusqueda,
  seccionLateral,
  setSeccionLateral,
  error,
  centrarDispositivo,
  centrarGeocerca,
  editarGeocerca,
  cambiarEstadoGeocerca,
  eliminarGeocerca,
  usuario,
  cerrarSesion,
}) {
  // Estado para filtrado individual en la sección de eventos
  const [filtroDispositivoId, setFiltroDispositivoId] = useState('todos');
  const [modoVistaEventos, setModoVistaEventos] = useState('columnas'); // 'columnas' | 'cronologico'

  const cantidadEnLinea = dispositivos.filter(
    (d) => estadoSenal(d.ultima_ubicacion).enLinea
  ).length;

  const nombreDispositivo = (id) =>
    dispositivos.find((d) => d.id === id)?.nombre ?? 'Dispositivo';

  const obtenerNombreGeocerca = (id) =>
    geocercas.find((g) => g.id === id)?.nombre ?? 'Zona';

  // Filtrado de eventos por dispositivo seleccionado
  const eventosPorDispositivo = eventos.filter((ev) => {
    if (filtroDispositivoId === 'todos') return true;
    return ev.dispositivo_id === filtroDispositivoId;
  });

  const eventosEntradas = eventosPorDispositivo.filter((ev) => ev.tipo === 'entrada');
  const eventosSalidasYCruces = eventosPorDispositivo.filter(
    (ev) => ev.tipo === 'salida' || ev.tipo === 'cruce'
  );

  return (
    <aside className="sidebar">
      {/* CABECERA PRINCIPAL */}
      <div className="sidebar-intro sidebar-brand-header">
        <div className="sidebar-brand-main">
          <div className="brand-symbol">
            <Icono nombre="pin" tamano={22} />
          </div>
          <div className="brand-text">
            <div className="brand-name">Nexo GPS</div>
            <div className="brand-caption">Centro de monitoreo</div>
          </div>
        </div>
        <div className="sidebar-header-actions">
          <button
            type="button"
            className="sidebar-tool-button"
            onClick={() => setTema((actual) => (actual === 'claro' ? 'oscuro' : 'claro'))}
            title={tema === 'claro' ? 'Activar modo oscuro' : 'Activar modo claro'}
          >
            <Icono nombre={tema === 'claro' ? 'moon' : 'sun'} tamano={18} />
          </button>
          <button
            type="button"
            className="sidebar-tool-button"
            onClick={() => cargarDatos({ silencioso: false })}
            disabled={cargando}
            title="Actualizar datos"
          >
            <Icono nombre="refresh" tamano={18} />
          </button>
        </div>
        <div className="sidebar-sync-line">
          <span className={`status-dot ${ultimaConsulta ? 'is-active' : 'is-inactive'}`} />
          <span>
            {ultimaConsulta
              ? `Sincronizado ${horaCorta(ultimaConsulta)}`
              : 'Esperando sincronización'}
          </span>
          <span className="sync-frequency">· cada 5 s</span>
        </div>
      </div>

      {/* MÉTRICAS SUPERIORES */}
      <div className="sidebar-metrics">
        <div className="metric-tile">
          <span className="metric-label">Dispositivos</span>
          <strong>{dispositivos.length}</strong>
          <span className="metric-foot">
            {cantidadEnLinea} en línea · {dispositivos.length - cantidadEnLinea} inactivos
          </span>
        </div>
        <div className="metric-tile">
          <span className="metric-label">Geocercas</span>
          <strong>{geocercas.length}</strong>
          <span className="metric-foot">
            {geocercas.filter((g) => g.activa).length} activas
          </span>
        </div>
      </div>

      {/* BUSCADOR */}
      <div className="sidebar-search">
        <Icono nombre="search" tamano={18} />
        <input
          aria-label="Buscar en el panel"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar dispositivo o geocerca..."
        />
        {busqueda && (
          <button
            type="button"
            className="search-clear"
            onClick={() => setBusqueda('')}
            title="Limpiar búsqueda"
          >
            <Icono nombre="close" tamano={15} />
          </button>
        )}
      </div>

      {/* PESTAÑAS PRINCIPALES */}
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
            <strong>Atención:</strong>
            <span>{error}</span>
          </div>
        )}

        {/* =========================================================
            SECCIÓN DISPOSITIVOS (CON DETALLES Y GEOCERCA ACTUAL)
        ========================================================= */}
        {(seccionLateral === 'todos' || seccionLateral === 'dispositivos') && (
          <section className="sidebar-section">
            <div className="section-heading section-heading-spread">
              <div className="section-heading-title">
                <span className="section-icon">
                  <Icono nombre="device" tamano={17} />
                </span>
                <h2>Dispositivos</h2>
              </div>
              <span className="count-badge">{dispositivos.length}</span>
            </div>

            {dispositivos.length === 0 ? (
              <p className="empty-message">No hay dispositivos registrados.</p>
            ) : (
              <div className="entity-list">
                {dispositivos.map((disp) => {
                  const senal = estadoSenal(disp.ultima_ubicacion);
                  const u = disp.ultima_ubicacion;
                  const velocidadKmh =
                    u?.velocidad_m_s != null
                      ? (u.velocidad_m_s * 3.6).toFixed(1)
                      : '0.0';
                  const precisionMetros =
                    u?.precision_m != null ? Math.round(u.precision_m) : null;
                  const geocercasAdentro = disp.geocercasActuales ?? [];

                  return (
                    <div className="device-card-pro" key={disp.id}>
                      <div className="device-card-header">
                        <span
                          className={`entity-marker device-marker ${
                            senal.enLinea ? '' : 'is-inactive'
                          }`}
                        >
                          <Icono nombre="device" tamano={17} />
                        </span>
                        <div className="device-title-box">
                          <strong className="entity-title">{disp.nombre}</strong>
                          <span className="entity-subtitle">
                            {disp.descripcion || (disp.device_id ? `ID: ${disp.device_id}` : 'Móvil GPS')}
                          </span>
                        </div>
                        <span className={`signal-pill signal-${senal.tono}`}>
                          {senal.etiqueta}
                        </span>
                      </div>

                      {/* INDICADOR EN QUÉ GEOCERCA SE ENCUENTRA */}
                      <div className="geofence-presence-pill">
                        {geocercasAdentro.length > 0 ? (
                          <span className="inside-active">
                            Dentro de: <strong>{geocercasAdentro.map((g) => g.nombre).join(', ')}</strong>
                          </span>
                        ) : (
                          <span className="outside-neutral">Fuera de geocercas</span>
                        )}
                      </div>

                      {/* DETALLES DE POSICIÓN, VELOCIDAD Y PRECISIÓN */}
                      <div className="device-details-grid">
                        <div>
                          <span>Coordenadas:</span>
                          <strong>
                            {u
                              ? `${Number(u.latitud).toFixed(5)}, ${Number(u.longitud).toFixed(5)}`
                              : 'Sin datos'}
                          </strong>
                        </div>
                        <div>
                          <span>Velocidad:</span>
                          <strong>{velocidadKmh} km/h</strong>
                        </div>
                        <div>
                          <span>Precisión:</span>
                          <strong>{precisionMetros !== null ? `±${precisionMetros} m` : '--'}</strong>
                        </div>
                        <div>
                          <span>Último reporte:</span>
                          <strong>{u?.registrado_en ? fecha(u.registrado_en) : 'Nunca'}</strong>
                        </div>
                      </div>

                      {/* ACCIONES DEL DISPOSITIVO */}
                      <div className="device-card-footer">
                        <button
                          type="button"
                          className="button button-secondary btn-mini"
                          onClick={() => centrarDispositivo(disp)}
                          disabled={!u}
                        >
                          Centrar
                        </button>
                        <button
                          type="button"
                          className="button button-quiet btn-mini"
                          onClick={() => {
                            setFiltroDispositivoId(disp.id);
                            setSeccionLateral('eventos');
                          }}
                        >
                          Ver historial
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================================================
            SECCIÓN GEOCERCAS (CON DIMENSIONES Y DISPOSITIVOS DENTRO)
        ========================================================= */}
        {(seccionLateral === 'todos' || seccionLateral === 'geocercas') && (
          <section className="sidebar-section">
            <div className="section-heading section-heading-spread">
              <div className="section-heading-title">
                <span className="section-icon">
                  <Icono nombre="fence" tamano={17} />
                </span>
                <h2>Geocercas y Zonas</h2>
              </div>
              <span className="count-badge">{geocercas.length}</span>
            </div>

            {geocercas.length === 0 ? (
              <p className="empty-message">No hay geocercas guardadas.</p>
            ) : (
              <div className="entity-list">
                {geocercas.map((geo) => {
                  const dims = calcularDimensionesGeocerca(geo);
                  const dispositivosAdentro = geo.dispositivosDentro ?? [];

                  return (
                    <div className="geofence-card-pro" key={geo.id}>
                      <div className="geofence-card-header">
                        <span
                          className={`entity-marker geofence-marker ${
                            geo.activa ? '' : 'is-inactive'
                          }`}
                        >
                          <Icono nombre="fence" tamano={17} />
                        </span>
                        <div className="geofence-title-box">
                          <strong className="entity-title">{geo.nombre}</strong>
                          <span className="entity-subtitle">
                            {etiquetaTipoGeocerca(geo)} · {geo.activa ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>
                      </div>

                      {/* DIMENSIONES DE LA ZONA */}
                      <div className="geofence-dim-pills">
                        {dims.area && <span>Área: {dims.area}</span>}
                        {dims.perimetro && <span>Perímetro: {dims.perimetro}</span>}
                        {dims.radio && <span>Radio: {dims.radio}</span>}
                        {dims.longitud && <span>Longitud: {dims.longitud}</span>}
                      </div>

                      {/* DISPOSITIVOS ACTUALMENTE DENTRO */}
                      <div className="geofence-occupants-box">
                        <span className="occupants-label">Dispositivos dentro ahora:</span>
                        {dispositivosAdentro.length > 0 ? (
                          <div className="occupants-tags">
                            {dispositivosAdentro.map((nombre, index) => (
                              <span key={`${nombre}-${index}`} className="occupant-tag">
                                {nombre}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="occupants-empty">Ningún dispositivo en la zona</span>
                        )}
                      </div>

                      {/* ACCIONES DE LA GEOCERCA */}
                      <div className="geofence-actions-bar">
                        <button
                          type="button"
                          className="button button-secondary btn-mini"
                          onClick={() => centrarGeocerca(geo)}
                        >
                          Centrar
                        </button>
                        <button
                          type="button"
                          className="button button-quiet btn-mini"
                          onClick={() => editarGeocerca(geo)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="button button-quiet btn-mini"
                          onClick={() => cambiarEstadoGeocerca(geo)}
                        >
                          {geo.activa ? 'Desactivar' : 'Activar'}
                        </button>
                        <button
                          type="button"
                          className="button button-quiet btn-mini btn-danger"
                          onClick={() => eliminarGeocerca(geo)}
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* =========================================================
            SECCIÓN EVENTOS (DIVIDIDA EN 2 BARRAS / COLUMNAS)
        ========================================================= */}
        {(seccionLateral === 'todos' || seccionLateral === 'eventos') && (
          <section className="sidebar-section">
            <div className="section-heading section-heading-spread">
              <div className="section-heading-title">
                <span className="section-icon">
                  <Icono nombre="history" tamano={17} />
                </span>
                <h2>Historial de Eventos</h2>
              </div>
              <span className="count-badge">{eventosPorDispositivo.length}</span>
            </div>

            {/* FILTROS DE EVENTOS: POR DISPOSITIVO Y POR MODO */}
            <div className="events-controls-box">
              <div className="events-filter-row">
                <label htmlFor="select-device-events">Celular:</label>
                <select
                  id="select-device-events"
                  value={filtroDispositivoId}
                  onChange={(e) => setFiltroDispositivoId(e.target.value)}
                >
                  <option value="todos">Todos los dispositivos</option>
                  {dispositivos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="events-toggle-buttons">
                <button
                  type="button"
                  className={modoVistaEventos === 'columnas' ? 'active' : ''}
                  onClick={() => setModoVistaEventos('columnas')}
                >
                  Entradas y Salidas
                </button>
                <button
                  type="button"
                  className={modoVistaEventos === 'cronologico' ? 'active' : ''}
                  onClick={() => setModoVistaEventos('cronologico')}
                >
                  Cronológico
                </button>
              </div>
            </div>

            {eventosPorDispositivo.length === 0 ? (
              <p className="empty-message">No hay eventos para los filtros seleccionados.</p>
            ) : modoVistaEventos === 'columnas' ? (
              /* MODO 2 COLUMNAS PARALELAS DESPLAZABLES */
              <div className="events-dual-columns">
                {/* COLUMNA 1: ACTIVIDAD DE ENTRADA */}
                <div className="event-column-wrapper">
                  <div className="column-header entry-header">
                    <span>Actividad de Entrada</span>
                    <span className="column-badge">{eventosEntradas.length}</span>
                  </div>
                  <div className="column-scroll-area">
                    {eventosEntradas.map((ev) => (
                      <div className="event-card-compact entry-card" key={ev.id}>
                        <strong>{nombreDispositivo(ev.dispositivo_id)}</strong>
                        <span className="event-place">Entró a: {obtenerNombreGeocerca(ev.geocerca_id)}</span>
                        <time>{fecha(ev.ocurrido_en)}</time>
                      </div>
                    ))}
                    {eventosEntradas.length === 0 && (
                      <span className="column-empty">Sin entradas registradas</span>
                    )}
                  </div>
                </div>

                {/* COLUMNA 2: ACTIVIDAD DE SALIDA Y CRUCES */}
                <div className="event-column-wrapper">
                  <div className="column-header exit-header">
                    <span>Salidas y Cruces</span>
                    <span className="column-badge">{eventosSalidasYCruces.length}</span>
                  </div>
                  <div className="column-scroll-area">
                    {eventosSalidasYCruces.map((ev) => (
                      <div
                        className={`event-card-compact ${
                          ev.tipo === 'salida' ? 'exit-card' : 'cross-card'
                        }`}
                        key={ev.id}
                      >
                        <strong>{nombreDispositivo(ev.dispositivo_id)}</strong>
                        <span className="event-place">
                          {ev.tipo === 'salida' ? 'Salió de:' : 'Cruzó:'}{' '}
                          {obtenerNombreGeocerca(ev.geocerca_id)}
                        </span>
                        <time>{fecha(ev.ocurrido_en)}</time>
                      </div>
                    ))}
                    {eventosSalidasYCruces.length === 0 && (
                      <span className="column-empty">Sin salidas ni cruces</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* MODO CRONOLÓGICO UNIFICADO EN ORDEN */
              <div className="event-list">
                {eventosPorDispositivo.map((evento) => (
                  <div className="event-row" key={evento.id}>
                    <span
                      className={`event-indicator ${
                        evento.tipo === 'entrada'
                          ? 'event-entry'
                          : evento.tipo === 'salida'
                          ? 'event-exit'
                          : 'event-cross'
                      }`}
                    />
                    <div className="event-copy">
                      <strong>
                        {evento.tipo === 'entrada'
                          ? 'Entrada a geocerca'
                          : evento.tipo === 'salida'
                          ? 'Salida de geocerca'
                          : 'Cruce de línea'}
                      </strong>
                      <span>
                        {nombreDispositivo(evento.dispositivo_id)} ·{' '}
                        {obtenerNombreGeocerca(evento.geocerca_id)}
                      </span>
                      <time>{fecha(evento.ocurrido_en)}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      {/* PIE DE PÁGINA */}
      <footer className="sidebar-footer">
        <span className="account-avatar">
          {(usuario.email?.charAt(0) ?? 'A').toUpperCase()}
        </span>
        <span className="account-copy">
          <strong>{usuario.email}</strong>
          <span>Administrador</span>
        </span>
        <button
          type="button"
          className="icon-button"
          onClick={cerrarSesion}
          title="Cerrar sesión"
        >
          <Icono nombre="logout" tamano={17} />
        </button>
      </footer>
    </aside>
  );
}