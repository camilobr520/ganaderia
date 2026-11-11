export const TIPO_SERVICIO = Object.freeze({
  TORO: 1,
  PAJILLA: 2,
})

export const ESTADO_PALPACION = Object.freeze({
  CARGADA: 1,
  NO_CARGADA: 2,
})

export const SEXO_CRIA = Object.freeze({
  MACHO: 1,
  HEMBRA: 2,
})

export const SEGUIMIENTO_OPTIONS = Object.freeze({
  tipoServicio: [
    { value: TIPO_SERVICIO.TORO, label: 'Toro' },
    { value: TIPO_SERVICIO.PAJILLA, label: 'Pajilla' },
  ],
  estadoPalpacion: [
    { value: ESTADO_PALPACION.CARGADA, label: 'Cargada' },
    { value: ESTADO_PALPACION.NO_CARGADA, label: 'No cargada' },
  ],
  sexoCria: [
    { value: SEXO_CRIA.MACHO, label: 'Macho' },
    { value: SEXO_CRIA.HEMBRA, label: 'Hembra' },
  ],
})
