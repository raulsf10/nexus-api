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
    const normalizadas = entradas.map((entrada, indice) => {
      const folioJtrac =
        typeof entrada.folioJtrac === 'string' ? entrada.folioJtrac.trim().toUpperCase() : '';
      const numero =
        typeof entrada.idInforme === 'number' || typeof entrada.idInforme === 'string'
          ? Number(entrada.idInforme)
          : NaN;
      const idInforme =
        Number.isSafeInteger(numero) && numero > 0 && numero <= 2147483647 ? numero : null;
      return { fila: entrada.fila ?? indice + 2, folioJtrac, idInforme };
    });
    const ids = [...new Set(normalizadas.map((fila) => fila.idInforme))].filter(
      (id): id is number => id !== null,
    );
    const foliosConsultar = [...new Set(normalizadas.map((fila) => fila.folioJtrac))].filter(
      (folio) => folio && Buffer.byteLength(folio, 'utf8') <= 256,
    );
    const [catalogoInformes, folios] = await Promise.all([
      this.informes.obtenerPorIds(ids),
      this.repositorio.obtenerFoliosExistentes(foliosConsultar),
    ]);
    const informes = new Map(catalogoInformes.map((informe) => [informe.skVeo, informe.nombre]));
    const foliosConDatosValidos = [
      ...new Set(
        normalizadas
          .filter(
            (fila) =>
              fila.idInforme !== null &&
              informes.has(fila.idInforme) &&
              folios.has(fila.folioJtrac),
          )
          .map((fila) => fila.folioJtrac),
      ),
    ];
    const relaciones = new Set(
      (await this.repositorio.obtenerRelacionesPorFolios(foliosConDatosValidos)).map(
        (relacion) => `${relacion.folioJtrac}:${relacion.idInforme}`,
      ),
    );
    const pares = new Set<string>();
    const filas = [];
    for (const entrada of normalizadas) {
      const { folioJtrac, idInforme } = entrada;
      const errores: Array<{ campo: string; codigo: string; mensaje: string }> = [];
      const error = (campo: string, mensaje: string) =>
        errores.push({ campo, codigo: 'VALIDACION', mensaje });
      if (!folioJtrac || Buffer.byteLength(folioJtrac, 'utf8') > 256)
        error('folioJtrac', 'Indica un folio JTRAC válido.');
      else if (!folios.has(folioJtrac)) error('folioJtrac', 'El folio JTRAC no existe.');
      if (idInforme === null) error('idInforme', 'Indica un ID de informe válido.');
      else if (!informes.has(idInforme)) error('idInforme', 'El informe no existe.');
      const clave = `${folioJtrac}:${idInforme}`;
      if (pares.has(clave)) error('general', 'La relación está repetida en el archivo.');
      pares.add(clave);
      if (!errores.length && idInforme !== null) {
        const existe = relaciones.has(clave);
        if (operacion === OperacionCarga.ASIGNACION && existe)
          error('general', 'La relación ya existe.');
        if (operacion === OperacionCarga.ELIMINACION && !existe)
          error('general', 'La relación no existe.');
      }
      filas.push({
        fila: entrada.fila,
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
    const errores = resultado.filas
      .filter((fila) => fila.estado === 'error')
      .map((fila) => `Fila ${fila.fila}: ${fila.errores.map((error) => error.mensaje).join(' ')}`);
    if (errores.length)
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        'Revisa los datos de la plantilla.',
        400,
        { errores },
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
