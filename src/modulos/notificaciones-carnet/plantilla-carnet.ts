import { DatosPlantillaCarnet } from './interfaces/datos-plantilla-carnet.interface';

const ENCABEZADO = 'SUKARNE | CENTRAL DE INFORMACIÓN';
const MENSAJE_ASIGNACION =
  'Se te realizó la asignación de informe(s), la cual empezará a cobrarse nivel de uso la próxima semana, por lo cual debes estar pendiente de cumplir con la descarga del mismo para no tener afectaciones en tus indicadores. En caso de tener menos de 30 días en tu puesto, este se te cobrará después de un mes.';
const PDIS_INFORMATIVOS = new Set([44322, 44257, 44516]);
const MENSAJE_INFORMATIVO =
  'Se te ha asignado un PDI informativo, por lo que no aplicará ningún cobro por nivel de uso ni afectación en tus indicadores';
const MENSAJE_BAJA =
  'Se realizó la baja de informe(s) a tu usuario por solicitud de tu centralizador o dueño de proceso. Si tienes dudas, favor de contactar a tu centralizador o dueño de proceso correspondiente.';

interface SeccionPlantilla {
  introduccion: string[];
  columnas: string[];
  filas: string[][];
  mensaje: string | null;
}

export function asuntoCarnet(datos: DatosPlantillaCarnet): string {
  const titulos: Record<DatosPlantillaCarnet['tipo'], string> = {
    asignacion: 'Asignación de informes',
    eliminacion: 'Baja de informes',
    frecuencia: 'Cambios de frecuencia',
    'aviso-inicial': 'Asignación de informes | Aviso a RH',
  };
  return `${titulos[datos.tipo]} | Posición ${datos.idPosicion}`.replace(/[\r\n]+/g, ' ');
}

export function htmlCarnet(datos: DatosPlantillaCarnet): string {
  const contenido = obtenerSecciones(datos)
    .map((seccion) => {
      const introduccion = seccion.introduccion.map(parrafoHtml).join('');
      const columnas = seccion.columnas
        .map(
          (columna) =>
            `<th scope="col" align="left" style="padding:12px;border:1px solid #d9dfe6;background:#f1f4f8;font-size:13px;font-weight:600;">${escaparHtml(columna)}</th>`,
        )
        .join('');
      const filas = seccion.filas
        .map(
          (fila) =>
            `<tr>${fila.map((valor) => `<td style="padding:12px;border:1px solid #d9dfe6;vertical-align:top;overflow-wrap:anywhere;">${escaparHtml(valor)}</td>`).join('')}</tr>`,
        )
        .join('');
      const mensaje = seccion.mensaje ? parrafoHtml(seccion.mensaje) : '';
      return `${introduccion}<table width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;margin:16px 0 20px;"><thead><tr>${columnas}</tr></thead><tbody>${filas}</tbody></table>${mensaje}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escaparHtml(asuntoCarnet(datos))}</title></head>
<body style="margin:0;padding:0;background:#f3f5f7;color:#263244;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f3f5f7;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="680" cellspacing="0" cellpadding="0" style="width:100%;max-width:680px;background:#ffffff;border:1px solid #d9dfe6;">
<tr><td style="padding:22px 28px;background:#a81b24;color:#ffffff;font-size:15px;font-weight:700;">${ENCABEZADO}</td></tr>
<tr><td style="padding:28px;overflow-wrap:anywhere;">
<h1 style="margin:0 0 20px;font-size:21px;line-height:1.4;color:#182334;">${escaparHtml(asuntoCarnet(datos))}</h1>
${contenido}
</td></tr></table>
</td></tr></table>
</body></html>`;
}

export function textoCarnet(datos: DatosPlantillaCarnet): string {
  const contenido = obtenerSecciones(datos)
    .map((seccion) =>
      [
        ...seccion.introduccion,
        seccion.filas
          .map((fila) =>
            fila.map((valor, indice) => `${seccion.columnas[indice]}: ${valor}`).join('\n'),
          )
          .join('\n\n'),
        seccion.mensaje,
      ]
        .filter((texto): texto is string => Boolean(texto))
        .join('\n\n'),
    )
    .join('\n\n');
  return `${ENCABEZADO}\n\n${asuntoCarnet(datos)}\n\n${contenido}`;
}

function obtenerSecciones(datos: DatosPlantillaCarnet): SeccionPlantilla[] {
  if (datos.tipo === 'frecuencia') return seccionesFrecuencia(datos);
  if (datos.tipo === 'asignacion') {
    return [false, true].flatMap((informativo) => {
      const informes = datos.informes.filter(
        (informe) => PDIS_INFORMATIVOS.has(informe.idInforme) === informativo,
      );
      return informes.length
        ? seccionInformes(
            { ...datos, informes },
            informativo ? MENSAJE_INFORMATIVO : MENSAJE_ASIGNACION,
          )
        : [];
    });
  }
  return seccionInformes(datos, datos.tipo === 'eliminacion' ? MENSAJE_BAJA : null);
}

function seccionInformes(datos: DatosPlantillaCarnet, mensaje: string | null): SeccionPlantilla[] {
  const usuario = datos.usuarioAsignado?.trim();
  const destinatario = usuario ? `su usuario ${usuario}` : `su posición ${datos.idPosicion}`;
  const baja = datos.tipo === 'eliminacion';
  const inicial = datos.tipo === 'aviso-inicial';
  const nombres = datos.informes.map((informe) => valorDisponible(informe.nombre)).join(', ');
  const introduccion = inicial
    ? [
        datos.informes.length === 1
          ? `Se le asignó la herramienta ${nombres} al colaborador:`
          : `Se le asignaron las herramientas ${nombres} al colaborador:`,
        `Colaborador: ${valorDisponible(datos.usuarioAsignado)}`,
        `Posición: ${datos.idPosicion}`,
        `Correo: ${valorDisponible(datos.correoAsignado)}`,
      ]
    : [
        baja
          ? `Se realizó una baja de informes a ${destinatario}`
          : `${datos.informes.length === 1 ? 'Se asignó un informe' : 'Se asignaron informes'} a ${destinatario}`,
      ];

  return [
    {
      introduccion,
      columnas: baja ? ['Informe'] : ['Informe', 'Frecuencia', inicial ? 'Estatus' : 'Estatus PDI'],
      filas: datos.informes.map((informe) => [
        nombreInforme(informe),
        ...(baja
          ? []
          : [valorDisponible(informe.frecuencia), valorDisponible(informe.estatusInstalacion)]),
      ]),
      mensaje,
    },
  ];
}

function seccionesFrecuencia(datos: DatosPlantillaCarnet): SeccionPlantilla[] {
  const grupos = new Map<
    string,
    { anterior: string; actual: string; informes: DatosPlantillaCarnet['informes'] }
  >();
  for (const informe of datos.informes) {
    const anterior = valorDisponible(informe.frecuenciaAnterior);
    const actual = valorDisponible(informe.frecuencia);
    const clave = JSON.stringify([anterior, actual]);
    const grupo = grupos.get(clave);
    if (grupo) grupo.informes.push(informe);
    else grupos.set(clave, { anterior, actual, informes: [informe] });
  }
  return [...grupos.values()].map((grupo) => ({
    introduccion: [],
    columnas: ['Informe', 'Cambio de frecuencia'],
    filas: grupo.informes.map((informe) => [
      nombreInforme(informe),
      `${grupo.anterior} → ${grupo.actual}`,
    ]),
    mensaje: `La frecuencia de informe(s) cambió de ${grupo.anterior} a ${grupo.actual} por solicitud de tu centralizador o dueño de procesos. Si tienes dudas sobre el cambio, favor de comunicarte con tu centralizador o dueño de procesos correspondiente.`,
  }));
}

function nombreInforme(informe: DatosPlantillaCarnet['informes'][number]): string {
  return `${informe.idInforme} - ${valorDisponible(informe.nombre)}`;
}

function valorDisponible(valor: string | null | undefined): string {
  return valor?.trim() || 'No disponible';
}

function parrafoHtml(texto: string): string {
  return `<p style="margin:0 0 14px;">${escaparHtml(texto)}</p>`;
}

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
