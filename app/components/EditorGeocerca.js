export default function EditorGeocerca({
  editorGeocercaAbierto,
  geocercaEditando,
  cancelarEditor,
  nombreGeocerca,
  setNombreGeocerca,
  descripcionGeocerca,
  setDescripcionGeocerca,
  tipoGeocerca,
  radioGeocerca,
  setRadioGeocerca,
  dibujoFinalizado,
  puntosDibujo,
  mensajeDibujo,
  deshacerPunto,
  terminarDibujo,
  modoDibujo,
  guardarGeocerca,
  guardandoGeocerca,
}) {
  if (!editorGeocercaAbierto) return null;

  return (
    <section className="draw-editor" aria-label="Editor de geocercas">
      <div className="draw-editor-heading">
        <div>
          <strong>{geocercaEditando ? 'Editar geocerca' : 'Nueva geocerca'}</strong>
          <span>Dibuja directamente sobre el mapa</span>
        </div>
        <button
          type="button"
          className="draw-close"
          onClick={cancelarEditor}
          aria-label="Cerrar editor"
        >
          ×
        </button>
      </div>

      <label className="draw-field">
        <span>Nombre</span>
        <input
          value={nombreGeocerca}
          onChange={(e) => setNombreGeocerca(e.target.value)}
          maxLength={100}
          placeholder="Ej. Zona de trabajo"
        />
      </label>

      <label className="draw-field">
        <span>Descripción (opcional)</span>
        <input
          value={descripcionGeocerca}
          onChange={(e) => setDescripcionGeocerca(e.target.value)}
          maxLength={250}
          placeholder="Detalle de la zona"
        />
      </label>

      {tipoGeocerca === 'circulo' && (
        <label className="draw-field">
          <span>Radio (metros)</span>
          <input
            type="number"
            min="1"
            max="1000000"
            step="1"
            value={radioGeocerca}
            onChange={(e) => setRadioGeocerca(e.target.value)}
          />
        </label>
      )}

      <div className="draw-help">
        {tipoGeocerca === 'circulo'
          ? 'Un clic elige el centro. El radio se define arriba.'
          : tipoGeocerca === 'rectangulo'
          ? 'Marca dos esquinas opuestas.'
          : tipoGeocerca === 'linea'
          ? 'Marca al menos dos puntos para formar la línea.'
          : 'Marca al menos tres vértices para cerrar el área.'}
      </div>

      {dibujoFinalizado && puntosDibujo.length > 0 && (
        <div className="draw-help">
          Ajuste: arrastra un punto para mover ese vértice; arrastra el borde o el área para mover toda la forma.
        </div>
      )}

      {mensajeDibujo && <p className="draw-message">{mensajeDibujo}</p>}

      <div className="draw-point-count">
        Puntos: <strong>{puntosDibujo.length}</strong>
      </div>

      <div className="draw-actions">
        <button
          type="button"
          className="button button-secondary"
          onClick={deshacerPunto}
          disabled={!puntosDibujo.length}
        >
          Deshacer punto
        </button>
        <button
          type="button"
          className="button button-secondary"
          onClick={terminarDibujo}
          disabled={!modoDibujo}
        >
          Terminar
        </button>
      </div>

      <div className="draw-actions draw-actions-bottom">
        <button
          type="button"
          className="button button-primary"
          onClick={guardarGeocerca}
          disabled={!dibujoFinalizado || guardandoGeocerca}
        >
          {guardandoGeocerca
            ? 'Guardando...'
            : geocercaEditando
            ? 'Guardar cambios'
            : 'Guardar geocerca'}
        </button>
        <button type="button" className="button button-quiet" onClick={cancelarEditor}>
          Cancelar
        </button>
      </div>
    </section>
  );
}