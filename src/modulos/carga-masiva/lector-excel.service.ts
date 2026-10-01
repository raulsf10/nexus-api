import { Injectable } from '@nestjs/common';
import { CellValue, Row, Workbook } from 'exceljs';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { FRECUENCIAS_VALIDAS } from './carga-masiva.constantes';
import { OperacionCarga } from './enums/operacion-carga.enum';

export interface FilaCruda {
  fila: number;
  idPosicion: string | null;
  idInforme: string | null;
  frecuencia: string | null;
  estatusInstalacion: string | null;
}

interface IndicesColumnas {
  idPosicion: number;
  idInforme: number;
  frecuencia: number | null;
  estatusInstalacion: number | null;
}

const ENCABEZADOS = {
  idPosicion: 'ID POSICION',
  idInforme: 'ID INFORME',
  frecuencia: 'FRECUENCIA DE USO',
};

@Injectable()
export class LectorExcelService {
  async crearPlantilla(tipo: 'carnet' | 'indicadores', operacion: OperacionCarga): Promise<Buffer> {
    const libro = new Workbook();
    const hoja = libro.addWorksheet(tipo === 'carnet' ? 'Carnet' : 'Indicadores');
    const asignacionCarnet = tipo === 'carnet' && operacion === OperacionCarga.ASIGNACION;
    const encabezados =
      tipo === 'indicadores' ? ['FOLIO JTRAC', 'ID INFORME'] : ['ID POSICIÓN', 'ID INFORME'];
    if (asignacionCarnet) encabezados.push('FRECUENCIA DE USO', 'ESTATUS INSTALACION');
    hoja.columns = encabezados.map((header) => ({ header, width: 26 }));
    hoja.views = [{ state: 'frozen', ySplit: 1 }];
    const encabezado = hoja.getRow(1);
    encabezado.height = 28;
    encabezado.eachCell((celda) => {
      celda.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC31C25' } };
      celda.alignment = { vertical: 'middle' };
    });
    if (asignacionCarnet) {
      hoja.getCell('C2').value = 'Mensual';
      hoja.getCell('D2').value = 'EN INSTALACION';
      const listas = [FRECUENCIAS_VALIDAS.join(','), 'EN INSTALACION,INSTALADO'];
      for (let fila = 2; fila <= 2001; fila++) {
        listas.forEach((lista, indice) => {
          hoja.getCell(fila, indice + 3).dataValidation = {
            type: 'list',
            formulae: [`"${lista}"`],
            allowBlank: false,
            showErrorMessage: true,
            errorStyle: 'stop',
            errorTitle: 'Valor inválido',
            error: 'Selecciona un valor de la lista.',
          };
        });
      }
    }
    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  async leerFilas(buffer: Buffer): Promise<FilaCruda[]> {
    const libro = new Workbook();
    try {
      // El tipo Buffer de @types/node no encaja con el que declara exceljs;
      // el contenido es idéntico en runtime.
      await libro.xlsx.load(buffer as unknown as Parameters<typeof libro.xlsx.load>[0]);
    } catch {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no es un Excel válido.',
        400,
      );
    }

    const hoja = libro.worksheets[0];
    if (!hoja || hoja.rowCount < 1) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no contiene ninguna hoja con datos.',
        400,
      );
    }

    const indices = this.mapearEncabezados(hoja.getRow(1));

    const filas: FilaCruda[] = [];
    for (let numero = 2; numero <= hoja.rowCount; numero++) {
      const fila = hoja.getRow(numero);
      const idPosicion = this.valorCelda(fila.getCell(indices.idPosicion).value);
      const idInforme = this.valorCelda(fila.getCell(indices.idInforme).value);
      const frecuencia =
        indices.frecuencia !== null
          ? this.valorCelda(fila.getCell(indices.frecuencia).value)
          : null;

      const estatusInstalacion =
        indices.estatusInstalacion === null
          ? null
          : this.valorCelda(fila.getCell(indices.estatusInstalacion).value);
      if (idPosicion === null && idInforme === null) {
        continue;
      }
      filas.push({ fila: numero, idPosicion, idInforme, frecuencia, estatusInstalacion });
    }

    return filas;
  }

  private mapearEncabezados(encabezado: Row): IndicesColumnas {
    let idPosicion: number | null = null;
    let idInforme: number | null = null;
    let frecuencia: number | null = null;
    let estatusInstalacion: number | null = null;

    encabezado.eachCell((celda, columna) => {
      const texto = this.normalizarEncabezado(this.valorCelda(celda.value));
      if (texto === ENCABEZADOS.idPosicion) idPosicion = columna;
      else if (texto === ENCABEZADOS.idInforme) idInforme = columna;
      else if (texto === ENCABEZADOS.frecuencia) frecuencia = columna;
      else if (
        [
          'ESTATUS',
          'ESTATUS INSTALACION',
          'ESTATUS DE INSTALACION',
          'ESTATUS EN INSTALACION',
        ].includes(texto)
      )
        estatusInstalacion = columna;
    });

    if (idPosicion === null || idInforme === null) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no tiene las columnas esperadas (ID POSICIÓN, ID INFORME).',
        400,
      );
    }

    return { idPosicion, idInforme, frecuencia, estatusInstalacion };
  }

  private normalizarEncabezado(texto: string | null): string {
    if (texto === null) return '';
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim().replace(/\s+/g, ' ');
  }

  private valorCelda(valor: CellValue): string | null {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'string' || typeof valor === 'number' || typeof valor === 'boolean') {
      const texto = String(valor).trim();
      return texto.length > 0 ? texto : null;
    }
    if (valor instanceof Date) {
      return String(valor.getTime());
    }
    // Celdas con fórmula, hyperlink o rich text vienen como objeto.
    const objeto = valor as { result?: unknown; text?: unknown };
    if (objeto.result !== undefined && objeto.result !== null) {
      const texto = String(objeto.result).trim();
      return texto.length > 0 ? texto : null;
    }
    if (objeto.text !== undefined && objeto.text !== null) {
      const texto = String(objeto.text).trim();
      return texto.length > 0 ? texto : null;
    }
    return null;
  }
}
