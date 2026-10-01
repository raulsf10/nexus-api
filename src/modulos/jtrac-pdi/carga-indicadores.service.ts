import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { InformesRepository } from '../informes/informes.repository';
import { OperacionCarga } from '../carga-masiva/enums/operacion-carga.enum';
import { FilaIndicadorDto } from './dto/carga-indicadores.dto';
import { JtracPdiRepository } from './jtrac-pdi.repository';

@Injectable()
export class CargaIndicadoresService {
  constructor(
    private readonly repositorio: JtracPdiRepository,
    private readonly informes: InformesRepository,
    private readonly configuracion: ConfiguracionService,
  ) {}

  async validarArchivo(operacion: OperacionCarga, archivo: Buffer) {
    const libro = new Workbook();
    try {
      await libro.xlsx.load(archivo as unknown as Parameters<typeof libro.xlsx.load>[0]);
    } catch {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no es un Excel válido.',
        400,
      );
    }
    const hoja = libro.worksheets[0];
    let folio = 0;
    let informe = 0;
    hoja?.getRow(1).eachCell((celda, indice) => {
      const texto = celda.text.trim().toUpperCase();
      if (texto === 'FOLIO JTRAC') folio = indice;
      if (texto === 'ID INFORME') informe = indice;
    });
    if (!hoja || !folio || !informe)
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo requiere FOLIO JTRAC e ID INFORME.',
        400,
      );
    const filas: FilaIndicadorDto[] = [];
    hoja.eachRow((fila, numero) => {
      if (numero === 1) return;
      const folioJtrac = fila.getCell(folio).text.trim();
      const idInforme = fila.getCell(informe).text.trim();
      if (folioJtrac || idInforme) filas.push({ fila: numero, folioJtrac, idInforme });
    });
    return this.validar(operacion, filas);
  }

  async validar(operacion: OperacionCarga, entradas: FilaIndicadorDto[]) {
    const maximo = this.configuracion.obtenerApp().cargaMasivaMaxFilas;
    if (!entradas.length || entradas.length > maximo)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        `Carga entre 1 y ${maximo} registros.`,
        400,
      );
    const esquema = await this.repositorio.estadoEsquema();
    if (
      !esquema.tablaDisponible ||
      (operacion === OperacionCarga.ASIGNACION && !esquema.secuenciaDisponible)
    ) {
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'No se puede procesar la carga. Contacta al administrador.',
        409,
      );
    }
    const informes = new Map<number, string | null>();
    const folios = new Map<string, boolean>();
    const pares = new Set<string>();
    const filas = [];
    for (const [indice, entrada] of entradas.entries()) {
      const folioJtrac =
        typeof entrada.folioJtrac === 'string' ? entrada.folioJtrac.trim().toUpperCase() : '';
      const numero =
        typeof entrada.idInforme === 'number' || typeof entrada.idInforme === 'string'
          ? Number(entrada.idInforme)
          : NaN;
      const idInforme =
        Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647 ? numero : null;
      const errores: Array<{ campo: string; codigo: string; mensaje: string }> = [];
      const error = (campo: string, mensaje: string) =>
        errores.push({ campo, codigo: 'VALIDACION', mensaje });
      if (!folioJtrac || Buffer.byteLength(folioJtrac, 'utf8') > 256)
        error('folioJtrac', 'Indica un folio JTRAC válido.');
      else {
        if (!folios.has(folioJtrac))
          folios.set(folioJtrac, (await this.repositorio.indicadores(folioJtrac)).existe);
        if (!folios.get(folioJtrac)) error('folioJtrac', 'El folio JTRAC no existe.');
      }
      if (idInforme === null) error('idInforme', 'Indica un ID de informe válido.');
      else {
        if (!informes.has(idInforme))
          informes.set(idInforme, (await this.informes.obtenerPorSkVeo(idInforme))?.nombre ?? null);
        if (informes.get(idInforme) === null) error('idInforme', 'El informe no existe.');
      }
      const clave = `${folioJtrac}:${idInforme}`;
      if (pares.has(clave)) error('general', 'La relación está repetida en el archivo.');
      pares.add(clave);
      if (!errores.length && idInforme !== null) {
        const actual = await this.repositorio.encontrarRelacion({ folioJtrac, idInforme });
        if (operacion === OperacionCarga.ASIGNACION && actual !== null)
          error('general', 'La relación ya existe.');
        if (operacion === OperacionCarga.ELIMINACION && actual === null)
          error('general', 'La relación no existe.');
      }
      filas.push({
        fila: entrada.fila ?? indice + 2,
        folioJtrac,
        idInforme,
        idPosicion: null,
        frecuencia: null,
        estatusInstalacion: null,
        nombrePosicion: null,
        nombreInforme: idInforme === null ? null : (informes.get(idInforme) ?? null),
        estado: errores.length ? ('error' as const) : ('valido' as const),
        errores,
      });
    }
    const filasConError = filas.filter((fila) => fila.estado === 'error').length;
    return {
      operacion,
      filas,
      totalFilas: filas.length,
      filasConError,
      filasValidas: filas.length - filasConError,
      filasInformativas: 0,
    };
  }

  async procesar(operacion: OperacionCarga, entradas: FilaIndicadorDto[], usuario: string) {
    const resultado = await this.validar(operacion, entradas);
    const primera = resultado.filas.find((fila) => fila.estado === 'error');
    if (primera)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        `Fila ${primera.fila}: ${primera.errores[0].mensaje}`,
        400,
      );
    const filas = resultado.filas.map((fila) => ({
      folioJtrac: fila.folioJtrac,
      idInforme: fila.idInforme!,
    }));
    await this.repositorio.aplicarLote(filas, operacion === OperacionCarga.ELIMINACION, usuario);
    return {
      total: filas.length,
      exitosas: filas.length,
      fallidas: 0,
      resultados: filas.map((fila) => ({
        ...fila,
        idPosicion: null,
        exitoso: true,
        mensaje: 'Aplicado.',
      })),
    };
  }
}
