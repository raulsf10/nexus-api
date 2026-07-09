import { Injectable } from '@nestjs/common';
import { CellValue, Row, Workbook } from 'exceljs';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';

export interface FilaCruda {
  fila: number;
  idPosicion: string | null;
  idInforme: string | null;
  frecuencia: string | null;
}

interface IndicesColumnas {
  idPosicion: number;
  idInforme: number;
  frecuencia: number | null;
}

const ENCABEZADOS = {
  idPosicion: 'ID POSICION',
  idInforme: 'ID INFORME',
  frecuencia: 'FRECUENCIA DE USO',
};

@Injectable()
export class LectorExcelService {
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

      if (idPosicion === null && idInforme === null && frecuencia === null) {
        continue;
      }
      filas.push({ fila: numero, idPosicion, idInforme, frecuencia });
    }

    return filas;
  }

  private mapearEncabezados(encabezado: Row): IndicesColumnas {
    let idPosicion: number | null = null;
    let idInforme: number | null = null;
    let frecuencia: number | null = null;

    encabezado.eachCell((celda, columna) => {
      const texto = this.normalizarEncabezado(this.valorCelda(celda.value));
      if (texto === ENCABEZADOS.idPosicion) idPosicion = columna;
      else if (texto === ENCABEZADOS.idInforme) idInforme = columna;
      else if (texto === ENCABEZADOS.frecuencia) frecuencia = columna;
    });

    if (idPosicion === null || idInforme === null) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no tiene las columnas esperadas (ID POSICIÓN, ID INFORME).',
        400,
      );
    }

    return { idPosicion, idInforme, frecuencia };
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
