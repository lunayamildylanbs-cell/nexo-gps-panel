'use client';

export default function BarraHerramientas({
  editorGeocercaAbierto,
  tipoGeocerca,
  activarHerramientaGeocerca,
  geocercaEditando,
}) {
  const herramientas = [
    {
      id: 'circulo',
      titulo: 'Crear círculo',
      svg: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
        </svg>
      ),
    },
    {
      id: 'rectangulo',
      titulo: 'Crear rectángulo',
      svg: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="5" width="16" height="14" rx="2" />
        </svg>
      ),
    },
    {
      id: 'poligono',
      titulo: 'Crear polígono / cuadra',
      svg: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="12 3 21 8.5 17.5 19 6.5 19 3 8.5" />
        </svg>
      ),
    },
    {
      id: 'linea',
      titulo: 'Crear línea / calle',
      svg: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="5" y1="19" x2="19" y2="5" />
          <circle cx="5" cy="19" r="1.5" fill="currentColor" />
          <circle cx="19" cy="5" r="1.5" fill="currentColor" />
        </svg>
      ),
    },
  ];

  return (
    <div className="map-draw-toolbar-topright" role="group" aria-label="Herramientas para crear geocercas">
      {herramientas.map((h) => {
        const seleccionada = editorGeocercaAbierto && tipoGeocerca === h.id;
        return (
          <button
            key={h.id}
            type="button"
            className={`shape-tool-btn ${seleccionada ? 'is-selected' : ''}`}
            onClick={() => activarHerramientaGeocerca(h.id)}
            title={h.titulo}
            aria-label={h.titulo}
            disabled={!!geocercaEditando}
          >
            {h.svg}
          </button>
        );
      })}
    </div>
  );
}