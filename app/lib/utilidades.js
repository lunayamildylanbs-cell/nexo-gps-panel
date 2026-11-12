export function fecha(valor) {
  if (!valor) return 'Sin datos';

  const fechaValor = new Date(valor);
  if (Number.isNaN(fechaValor.getTime())) return 'Fecha inválida';

  return fechaValor.toLocaleString('es-BO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function horaCorta(valor) {
  if (!valor) return 'Sin actualización';

  const fechaValor = new Date(valor);
  if (Number.isNaN(fechaValor.getTime())) return 'Fecha inválida';

  return fechaValor.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function estadoSenal(ubicacion) {
  if (!ubicacion?.registrado_en) {
    return {
      etiqueta: 'Sin señal',
      detalle: 'Todavía no hay una ubicación recibida',
      tono: 'muted',
      enLinea: false,
    };
  }

  const instante = new Date(ubicacion.registrado_en).getTime();
  if (!Number.isFinite(instante)) {
    return {
      etiqueta: 'Fecha inválida',
      detalle: 'No se puede interpretar la última ubicación',
      tono: 'muted',
      enLinea: false,
    };
  }

  const antiguedad = Date.now() - instante;
  const enLinea = antiguedad <= 120000 && antiguedad >= -60000;

  return enLinea
    ? {
        etiqueta: 'En línea',
        detalle: 'Última ubicación: ' + horaCorta(ubicacion.registrado_en),
        tono: 'good',
        enLinea: true,
      }
    : {
        etiqueta: 'Inactivo',
        detalle: 'Última ubicación: ' + fecha(ubicacion.registrado_en),
        tono: 'warning',
        enLinea: false,
      };
}