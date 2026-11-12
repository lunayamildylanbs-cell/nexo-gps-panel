import Icono from './Icono';

export default function ControlesZoom({ acercarMapa, alejarMapa, centrarMapa }) {
  return (
    <div className="map-bottom-controls" role="group" aria-label="Controles del mapa">
      <button
        type="button"
        className="map-round-control"
        onClick={acercarMapa}
        title="Acercar"
        aria-label="Acercar"
      >
        +
      </button>
      <button
        type="button"
        className="map-round-control"
        onClick={alejarMapa}
        title="Alejar"
        aria-label="Alejar"
      >
        −
      </button>
      <span className="map-control-divider" />
      <button
        type="button"
        className="map-round-control map-center-control"
        onClick={centrarMapa}
        title="Centrar mapa"
        aria-label="Centrar mapa"
      >
        <Icono nombre="crosshair" tamano={20} />
      </button>
    </div>
  );
}