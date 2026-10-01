import { Injectable } from '@nestjs/common';
import {
  EstatusInstalacion,
  normalizarEstatusInstalacion,
} from '../carnet/enums/estatus-instalacion.enum';
import { EjecutorOracle, OracleService } from '../../base-datos/oracle/oracle.service';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { LoggerService } from '../../comun/logger/logger.service';
import { ConfiguracionService } from '../../configuracion/configuracion.service';
import { CarnetRepositoryOracle } from '../carnet/carnet.repository.oracle';
import { CarnetRepositorySqlServer } from '../carnet/carnet.repository.sql-server';
import { AccionHistorial } from '../historial-carnet/enums/accion-historial.enum';
import { OrigenHistorial } from '../historial-carnet/enums/origen-historial.enum';
import { HistorialCarnetService } from '../historial-carnet/historial-carnet.service';
import { InformeEntidad } from '../informes/entidades/informe.entidad';
import { InformesRepository } from '../informes/informes.repository';
import { NotificacionesCarnetService } from '../notificaciones-carnet/notificaciones-carnet.service';
import { CambioCarnetCorreo } from '../notificaciones-carnet/interfaces/cambio-carnet-correo.interface';
import { UsuarioListadoEntidad } from '../usuarios/entidades/usuario-listado.entidad';
import { UsuariosRepository } from '../usuarios/usuarios.repository';
import { FRECUENCIAS_VALIDAS } from './carga-masiva.constantes';
import { FilaCargaDto } from './dto/fila-carga.dto';
import { CodigoErrorFila } from './enums/codigo-error-fila.enum';
import { OperacionCarga } from './enums/operacion-carga.enum';
import { FilaCruda, LectorExcelService } from './lector-excel.service';
import { ResultadoProceso } from './interfaces/resultado-proceso.interface';
import { SlaCarnetService } from '../notificaciones-carnet/sla-carnet.service';
import {
  ErrorFila,
  FilaValidada,
  ResultadoValidacion,
} from './interfaces/resultado-validacion.interface';

type AsignacionActual = { activo: number; frecuencia: string | null } | null;

// Códigos que NO bloquean la fila: solo la marcan como "informativo".
const CODIGOS_INFORMATIVOS: ReadonlySet<CodigoErrorFila> = new Set([
  CodigoErrorFila.CAMBIO_FRECUENCIA,
  CodigoErrorFila.REACTIVACION,
  CodigoErrorFila.CAMBIO_ESTATUS,
]);

interface ContextoValidacion {
  posiciones: Map<number, UsuarioListadoEntidad | null>;
  informes: Map<number, InformeEntidad | null>;
  asignaciones: Map<string, AsignacionActual>;
  paresVistos: Set<string>;
}

interface FilaPreparada {
  idPosicion: number;
  idInforme: number;
  frecuencia: string | null;
  estatusInstalacion: EstatusInstalacion | null;
}

// Qué debe replicarse en el espejo SQL Server tras el commit de Oracle.
interface PlanFila {
  idPosicion: number;
  idInforme: number;
  mensaje: string;
  insertar: boolean;
  reactivar: boolean;
  activacionDiferida: boolean;
  frecuenciaActualizar: string | null;
  eliminar: boolean;
  cambioEstatus?: boolean;
}

@Injectable()
export class CargaMasivaService {
  private readonly maxFilas: number;

  constructor(
    private readonly lectorExcel: LectorExcelService,
    private readonly usuarios: UsuariosRepository,
    private readonly informes: InformesRepository,
    private readonly carnetOracle: CarnetRepositoryOracle,
    private readonly carnetSqlServer: CarnetRepositorySqlServer,
    private readonly historial: HistorialCarnetService,
    private readonly notificaciones: NotificacionesCarnetService,
    private readonly oracle: OracleService,
    private readonly logger: LoggerService,
    configuracion: ConfiguracionService,
    private readonly sla: SlaCarnetService,
  ) {
    this.maxFilas = configuracion.obtenerApp().cargaMasivaMaxFilas;
  }

  async validarArchivo(
    operacion: OperacionCarga,
    buffer: Buffer,
    validarRelacion = true,
  ): Promise<ResultadoValidacion> {
    const crudas = await this.lectorExcel.leerFilas(buffer);
    if (crudas.length === 0) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo no contiene filas de datos.',
        400,
      );
    }
    return this.validar(operacion, crudas, validarRelacion, true);
  }

  async revalidar(
    operacion: OperacionCarga,
    filas: FilaCargaDto[],
    validarRelacion = true,
    exigirDatosAsignacion = validarRelacion,
  ): Promise<ResultadoValidacion> {
    const crudas: FilaCruda[] = filas.map((f, indice) => ({
      fila: typeof f.fila === 'number' ? f.fila : indice + 2,
      idPosicion: this.aTexto(f.idPosicion),
      idInforme: this.aTexto(f.idInforme),
      frecuencia: this.aTexto(f.frecuencia),
      estatusInstalacion: this.aTexto(f.estatusInstalacion),
    }));
    return this.validar(operacion, crudas, validarRelacion, exigirDatosAsignacion);
  }

  async procesar(
    operacion: OperacionCarga,
    filas: FilaCargaDto[],
    usuario: string,
    tareasPosteriores?: Array<() => Promise<void>>,
    conservarCamposVacios = false,
  ): Promise<ResultadoProceso> {
    this.verificarLimite(filas.length);

    const validacion = await this.revalidar(operacion, filas, false, !conservarCamposVacios);
    if (validacion.filasConError) {
      const fila = validacion.filas.find((item) => item.estado === 'error')!;
      throw new ExcepcionNegocio(
        CodigosError.VALIDACION,
        `Fila ${fila.fila}: ${fila.errores[0].mensaje}`,
        400,
      );
    }

    const preparadas: FilaPreparada[] = [];
    for (const f of filas) {
      const idPosicion = this.aEntero(this.aTexto(f.idPosicion));
      const idInforme = this.aEntero(this.aTexto(f.idInforme));
      // Todo-o-nada: una fila con identificadores inválidos aborta el lote antes
      // de tocar la BD (el front solo debería mandar filas ya validadas).
      if (idPosicion === null || idInforme === null) {
        throw new ExcepcionNegocio(
          CodigosError.VALIDACION,
          'El lote contiene filas con identificadores inválidos; no se aplicó ningún cambio.',
          400,
        );
      }
      preparadas.push({
        idPosicion,
        idInforme,
        frecuencia: this.normalizarFrecuencia(this.aTexto(f.frecuencia)),
        estatusInstalacion: normalizarEstatusInstalacion(f.estatusInstalacion),
      });
    }

    if (operacion === OperacionCarga.ASIGNACION) {
      if (preparadas.some((fila) => fila.estatusInstalacion !== null)) {
        await this.carnetOracle.asegurarEstatusInstalacionDisponible();
      }
      await this.sla.asegurarDisponible(preparadas.map((fila) => fila.idInforme));
    }
    let planes: PlanFila[];
    let cambios: CambioCarnetCorreo[] = [];
    let avisosPreparados: string[] = [];
    try {
      planes = await this.oracle.ejecutarEnTransaccion(async (ejecutor) => {
        const resultado = await this.aplicarLoteOracle(operacion, preparadas, ejecutor);
        cambios = this.crearCambiosLote(resultado, usuario);
        avisosPreparados = await this.sla.prepararAsignaciones(cambios, ejecutor);
        return resultado;
      });
    } catch (error) {
      // La transacción Oracle se revirtió por completo: ninguna fila se aplicó.
      const mensaje = `Lote revertido: ${this.mensajeError(error, operacion)}`;
      return {
        total: preparadas.length,
        exitosas: 0,
        fallidas: preparadas.length,
        resultados: preparadas.map((p) => ({
          idPosicion: p.idPosicion,
          idInforme: p.idInforme,
          exitoso: false,
          mensaje,
        })),
      };
    }

    // Oracle (fuente de verdad) confirmó. Espejo e historial son best-effort:
    // viven en otros servidores, no pueden ir en la transacción Oracle; sus
    // fallos se registran pero no revierten ni fallan la respuesta.
    const despuesDeConfirmar = async (): Promise<void> => {
      await this.replicarEnSqlServer(operacion, planes);
      await this.registrarHistorialLote(operacion, planes, usuario);
      for (const plan of planes) {
        if (plan.eliminar) await this.sla.cancelarAsignacion(plan.idPosicion, plan.idInforme);
      }
      await this.sla.confirmarAsignaciones(avisosPreparados);
      await this.notificaciones.enviarCambios(cambios);
    };
    if (tareasPosteriores) tareasPosteriores.push(despuesDeConfirmar);
    else await despuesDeConfirmar();

    return {
      total: planes.length,
      exitosas: planes.length,
      fallidas: 0,
      resultados: planes.map((plan) => ({
        idPosicion: plan.idPosicion,
        idInforme: plan.idInforme,
        exitoso: true,
        mensaje: plan.mensaje,
      })),
    };
  }

  private async aplicarLoteOracle(
    operacion: OperacionCarga,
    filas: FilaPreparada[],
    ejecutor: EjecutorOracle,
  ): Promise<PlanFila[]> {
    const planes: PlanFila[] = [];
    for (const f of filas) {
      if (operacion === OperacionCarga.ELIMINACION) {
        const asignacion = await this.carnetOracle.obtenerAsignacion(
          f.idPosicion,
          f.idInforme,
          ejecutor,
          true,
        );
        if (!asignacion) {
          planes.push({
            ...this.planEliminacion(f),
            eliminar: false,
            mensaje: 'Sin cambios (ya estaba retirado).',
          });
          continue;
        }
        await this.carnetOracle.eliminar(f.idPosicion, f.idInforme, ejecutor);
        planes.push(this.planEliminacion(f));
        continue;
      }
      const plan = await this.aplicarAsignacionOracle(f, ejecutor);
      planes.push(plan);
      if (f.estatusInstalacion !== null) {
        const anterior = await this.carnetOracle.obtenerEstatusInstalacion(
          f.idPosicion,
          f.idInforme,
          ejecutor,
        );
        await this.carnetOracle.actualizarEstatusInstalacion(
          f.idPosicion,
          f.idInforme,
          f.estatusInstalacion,
          ejecutor,
        );
        plan.cambioEstatus = anterior !== f.estatusInstalacion;
        if (plan.cambioEstatus && !plan.insertar) plan.mensaje = 'Actualizado.';
      }
    }
    return planes;
  }

  private async aplicarAsignacionOracle(
    f: FilaPreparada,
    ejecutor: EjecutorOracle,
  ): Promise<PlanFila> {
    const asignacion = await this.carnetOracle.obtenerAsignacion(
      f.idPosicion,
      f.idInforme,
      ejecutor,
      true,
    );
    const aplicaSla = this.sla.aplica(f.idInforme);

    if (asignacion === null) {
      await this.carnetOracle.agregar(f.idPosicion, f.idInforme, ejecutor);
      if (aplicaSla) {
        await this.carnetOracle.actualizarActivo(f.idPosicion, f.idInforme, 0, ejecutor);
      }
      if (f.frecuencia !== null) {
        await this.carnetOracle.actualizarFrecuencia(
          f.idPosicion,
          f.idInforme,
          f.frecuencia,
          ejecutor,
        );
      }
      return {
        idPosicion: f.idPosicion,
        idInforme: f.idInforme,
        mensaje: aplicaSla ? 'Asignado inactivo; pendiente de SLA y aviso final.' : 'Asignado.',
        insertar: true,
        reactivar: false,
        activacionDiferida: aplicaSla,
        frecuenciaActualizar: f.frecuencia,
        eliminar: false,
      };
    }

    const acciones: string[] = [];
    let reactivar = false;
    let frecuenciaActualizar: string | null = null;
    if (asignacion.activo === 0) {
      if (await this.sla.estaPendiente(f.idPosicion, f.idInforme)) {
        acciones.push('permanece inactivo por SLA pendiente');
      } else {
        if (!aplicaSla)
          await this.carnetOracle.actualizarActivo(f.idPosicion, f.idInforme, 1, ejecutor);
        reactivar = true;
        acciones.push(aplicaSla ? 'reactivación programada por SLA' : 'reactivado');
      }
    }
    if (f.frecuencia !== null && !this.mismaFrecuencia(f.frecuencia, asignacion.frecuencia)) {
      await this.carnetOracle.actualizarFrecuencia(
        f.idPosicion,
        f.idInforme,
        f.frecuencia,
        ejecutor,
      );
      frecuenciaActualizar = f.frecuencia;
      acciones.push('frecuencia actualizada');
    }

    const mensaje =
      acciones.length > 0
        ? `${this.capitalizar(acciones.join(' y '))}.`
        : 'Sin cambios (ya estaba asignado).';
    return {
      idPosicion: f.idPosicion,
      idInforme: f.idInforme,
      mensaje,
      insertar: false,
      reactivar,
      activacionDiferida: reactivar && aplicaSla,
      frecuenciaActualizar,
      eliminar: false,
    };
  }

  // Historial post-commit (best-effort): el SQL Server de historial es otro
  // servidor, no puede ir en la transacción Oracle. Resuelve nombres una sola
  // vez por id (caché) para no golpear Oracle de más en lotes grandes.
  private async registrarHistorialLote(
    operacion: OperacionCarga,
    planes: PlanFila[],
    usuario: string,
  ): Promise<void> {
    const cachePosiciones = new Map<number, string | null>();
    const cacheInformes = new Map<number, string | null>();

    for (const plan of planes) {
      const accion = this.accionDeHistorial(plan);
      if (accion === null) continue; // "Sin cambios" no genera historial.

      const posicion = await this.nombrePosicion(plan.idPosicion, cachePosiciones);
      const informe = await this.nombreInforme(plan.idInforme, cacheInformes);

      await this.historial.registrarCambio(
        {
          usuario,
          accion,
          fkPosicion: plan.idPosicion,
          fkVeo: plan.idInforme,
          frecuencia: plan.frecuenciaActualizar,
          origen: OrigenHistorial.CARGA_MASIVA,
        },
        { posicion, informe },
      );
    }
  }

  private accionDeHistorial(plan: PlanFila): AccionHistorial | null {
    if (plan.eliminar) return AccionHistorial.ELIMINAR;
    if (plan.insertar || (plan.reactivar && plan.activacionDiferida))
      return AccionHistorial.ASIGNAR;
    if (plan.reactivar) return AccionHistorial.ACTIVAR;
    if (plan.frecuenciaActualizar !== null) return AccionHistorial.CAMBIO_FRECUENCIA;
    if (plan.cambioEstatus) return AccionHistorial.CAMBIO_ESTATUS;
    return null;
  }

  private async nombrePosicion(
    id: number,
    cache: Map<number, string | null>,
  ): Promise<string | null> {
    if (cache.has(id)) return cache.get(id) ?? null;
    const nombre = await this.historial.resolverNombrePosicion(id);
    cache.set(id, nombre);
    return nombre;
  }

  private async nombreInforme(
    id: number,
    cache: Map<number, string | null>,
  ): Promise<string | null> {
    if (cache.has(id)) return cache.get(id) ?? null;
    const nombre = await this.historial.resolverNombreInforme(id);
    cache.set(id, nombre);
    return nombre;
  }

  private planEliminacion(f: FilaPreparada): PlanFila {
    return {
      idPosicion: f.idPosicion,
      idInforme: f.idInforme,
      mensaje: 'Eliminado.',
      insertar: false,
      reactivar: false,
      activacionDiferida: false,
      frecuenciaActualizar: null,
      eliminar: true,
    };
  }

  private async replicarEnSqlServer(operacion: OperacionCarga, planes: PlanFila[]): Promise<void> {
    for (const plan of planes) {
      try {
        if (plan.eliminar) {
          await this.carnetSqlServer.eliminar(plan.idPosicion, plan.idInforme);
          continue;
        }
        if (plan.insertar) {
          await this.carnetSqlServer.agregar(
            plan.idPosicion,
            plan.idInforme,
            plan.activacionDiferida ? 0 : 1,
          );
        }
        if (plan.reactivar) {
          await this.carnetSqlServer.actualizarActivo(
            plan.idPosicion,
            plan.idInforme,
            plan.activacionDiferida ? 0 : 1,
          );
        }
        if (plan.frecuenciaActualizar !== null) {
          await this.carnetSqlServer.actualizarFrecuencia(
            plan.idPosicion,
            plan.idInforme,
            plan.frecuenciaActualizar,
          );
        }
      } catch (error) {
        this.logger.advertencia('Mirror SQL Server falló en carga masiva', {
          operacion,
          idPosicion: plan.idPosicion,
          idInforme: plan.idInforme,
          error: (error as Error).message,
        });
      }
    }
  }

  private crearCambiosLote(planes: PlanFila[], usuario: string): CambioCarnetCorreo[] {
    const cambios: CambioCarnetCorreo[] = [];
    for (const plan of planes) {
      if (plan.eliminar) {
        cambios.push({
          idPosicion: plan.idPosicion,
          idInforme: plan.idInforme,
          tipo: 'eliminacion',
          usuario,
          origen: 'Carga masiva',
        });
        continue;
      }
      // Una reactivación vuelve a dejar el informe disponible para la
      // posición, por lo que se comunica igual que una asignación.
      if (plan.insertar || plan.reactivar) {
        cambios.push({
          idPosicion: plan.idPosicion,
          idInforme: plan.idInforme,
          tipo: 'asignacion',
          usuario,
          origen: 'Carga masiva',
        });
      }
    }
    return cambios;
  }

  private async validar(
    operacion: OperacionCarga,
    crudas: FilaCruda[],
    validarRelacion = true,
    exigirDatosAsignacion = false,
  ): Promise<ResultadoValidacion> {
    this.verificarLimite(crudas.length);

    const contexto: ContextoValidacion = {
      posiciones: new Map(),
      informes: new Map(),
      asignaciones: new Map(),
      paresVistos: new Set(),
    };

    const filas: FilaValidada[] = [];
    for (const c of crudas) {
      filas.push(
        await this.validarFila(operacion, c, contexto, validarRelacion, exigirDatosAsignacion),
      );
    }

    const filasConError = filas.filter((f) => f.estado === 'error').length;
    const filasInformativas = filas.filter((f) => f.estado === 'informativo').length;
    return {
      operacion,
      totalFilas: filas.length,
      filasValidas: filas.filter((f) => f.estado === 'valido').length,
      filasInformativas,
      filasConError,
      filas,
    };
  }

  private async validarFila(
    operacion: OperacionCarga,
    c: FilaCruda,
    contexto: ContextoValidacion,
    validarRelacion: boolean,
    exigirDatosAsignacion: boolean,
  ): Promise<FilaValidada> {
    const errores: ErrorFila[] = [];
    let idPosicion: number | null = null;
    let idInforme: number | null = null;
    let nombrePosicion: string | null = null;
    let nombreInforme: string | null = null;

    if (this.vacio(c.idPosicion)) {
      errores.push({
        campo: 'idPosicion',
        codigo: CodigoErrorFila.CAMPO_REQUERIDO,
        mensaje: 'El ID de posición es obligatorio.',
      });
    } else {
      idPosicion = this.aEntero(c.idPosicion);
      if (idPosicion === null) {
        errores.push({
          campo: 'idPosicion',
          codigo: CodigoErrorFila.FORMATO_INVALIDO,
          mensaje: `El ID de posición "${c.idPosicion}" no es un número válido.`,
        });
      }
    }

    if (this.vacio(c.idInforme)) {
      errores.push({
        campo: 'idInforme',
        codigo: CodigoErrorFila.CAMPO_REQUERIDO,
        mensaje: 'El ID de informe es obligatorio.',
      });
    } else {
      idInforme = this.aEntero(c.idInforme);
      if (idInforme === null) {
        errores.push({
          campo: 'idInforme',
          codigo: CodigoErrorFila.FORMATO_INVALIDO,
          mensaje: `El ID de informe "${c.idInforme}" no es un número válido.`,
        });
      }
    }

    const frecuenciaCanonica = this.normalizarFrecuencia(c.frecuencia);
    const estatusCanonico = normalizarEstatusInstalacion(c.estatusInstalacion);
    if (exigirDatosAsignacion && operacion === OperacionCarga.ASIGNACION) {
      if (this.vacio(c.frecuencia))
        errores.push({
          campo: 'frecuencia',
          codigo: CodigoErrorFila.CAMPO_REQUERIDO,
          mensaje: 'Selecciona una frecuencia.',
        });
      if (this.vacio(c.estatusInstalacion))
        errores.push({
          campo: 'estatusInstalacion',
          codigo: CodigoErrorFila.CAMPO_REQUERIDO,
          mensaje: 'Selecciona un estatus de instalación.',
        });
    }
    if (!this.vacio(c.estatusInstalacion) && estatusCanonico === null) {
      errores.push({
        campo: 'estatusInstalacion',
        codigo: CodigoErrorFila.ESTATUS_INVALIDO,
        mensaje: 'Selecciona EN INSTALACION o INSTALADO.',
      });
    }
    if (
      operacion === OperacionCarga.ASIGNACION &&
      !this.vacio(c.frecuencia) &&
      frecuenciaCanonica === null
    ) {
      errores.push({
        campo: 'frecuencia',
        codigo: CodigoErrorFila.FRECUENCIA_INVALIDA,
        mensaje: `La frecuencia "${c.frecuencia}" no es válida.`,
      });
    }

    if (idPosicion !== null) {
      const posicion = await this.obtenerPosicion(idPosicion, contexto);
      if (posicion === null) {
        errores.push({
          campo: 'idPosicion',
          codigo: CodigoErrorFila.POSICION_NO_EXISTE,
          mensaje: `La posición ${idPosicion} no existe.`,
        });
      } else {
        nombrePosicion = posicion.descripcion;
      }
    }

    if (idInforme !== null) {
      const informe = await this.obtenerInforme(idInforme, contexto);
      if (informe === null) {
        errores.push({
          campo: 'idInforme',
          codigo: CodigoErrorFila.INFORME_NO_EXISTE,
          mensaje: `El informe ${idInforme} no existe.`,
        });
      } else {
        nombreInforme = informe.nombre;
      }
    }

    // La primera aparición del par se procesa normal; las siguientes se marcan
    // como duplicado. El orden lo garantiza el recorrido secuencial de validar().
    if (idPosicion !== null && idInforme !== null) {
      const clave = `${idPosicion}:${idInforme}`;
      if (contexto.paresVistos.has(clave)) {
        errores.push({
          campo: 'general',
          codigo: CodigoErrorFila.DUPLICADO_EN_ARCHIVO,
          mensaje: `La posición ${idPosicion} con el informe ${idInforme} ya aparece en una fila anterior del archivo.`,
        });
      } else {
        contexto.paresVistos.add(clave);
      }
    }

    // El estado de asignación solo tiene sentido si posición e informe existen.
    if (
      validarRelacion &&
      nombrePosicion !== null &&
      nombreInforme !== null &&
      idPosicion !== null &&
      idInforme !== null
    ) {
      const asignacion = await this.obtenerAsignacion(idPosicion, idInforme, contexto);
      if (operacion === OperacionCarga.ASIGNACION && asignacion !== null) {
        const reactivar = asignacion.activo === 0;
        const cambiaFrecuencia =
          frecuenciaCanonica !== null &&
          !this.mismaFrecuencia(frecuenciaCanonica, asignacion.frecuencia);

        // Ya existe: si está desactivado y/o cambia la frecuencia es un aviso
        // (informativo) porque al procesar se reactiva/actualiza. Si no cambia
        // nada, sigue siendo un duplicado (error).
        if (reactivar) {
          errores.push({
            campo: 'general',
            codigo: CodigoErrorFila.REACTIVACION,
            mensaje: `Está desactivado; al procesar se revisará su reactivación (respetando cualquier SLA pendiente)${
              cambiaFrecuencia ? ' y se ajustará la frecuencia' : ''
            }.`,
          });
        }
        if (cambiaFrecuencia) {
          errores.push({
            campo: 'frecuencia',
            codigo: CodigoErrorFila.CAMBIO_FRECUENCIA,
            mensaje: `Ya está asignado con frecuencia "${asignacion.frecuencia ?? 'sin definir'}"; al procesar se actualizará a "${frecuenciaCanonica}".`,
          });
        }
        if (estatusCanonico !== null) {
          errores.push({
            campo: 'estatusInstalacion',
            codigo: CodigoErrorFila.CAMBIO_ESTATUS,
            mensaje: 'Se guardará el estatus indicado.',
          });
        }
        if (!reactivar && !cambiaFrecuencia && estatusCanonico === null) {
          errores.push({
            campo: 'general',
            codigo: CodigoErrorFila.YA_ASIGNADO,
            mensaje: `La posición ${idPosicion} ya tiene asignado el informe ${idInforme}.`,
          });
        }
      }
      if (operacion === OperacionCarga.ELIMINACION && asignacion === null) {
        errores.push({
          campo: 'general',
          codigo: CodigoErrorFila.NO_ASIGNADO,
          mensaje: `La posición ${idPosicion} no tiene asignado el informe ${idInforme}.`,
        });
      }
    }

    // Los códigos informativos (cambio de frecuencia, reactivación) no bloquean:
    // si son los únicos presentes la fila es "informativo"; cualquier otro código
    // la vuelve "error".
    const bloqueantes = errores.filter((e) => !CODIGOS_INFORMATIVOS.has(e.codigo));
    let estado: FilaValidada['estado'];
    if (bloqueantes.length > 0) estado = 'error';
    else if (errores.length > 0) estado = 'informativo';
    else estado = 'valido';

    return {
      fila: c.fila,
      idPosicion,
      idInforme,
      frecuencia: frecuenciaCanonica ?? c.frecuencia,
      estatusInstalacion: estatusCanonico ?? c.estatusInstalacion,
      estado,
      errores,
      nombrePosicion,
      nombreInforme,
    };
  }

  private async obtenerPosicion(
    idPosicion: number,
    contexto: ContextoValidacion,
  ): Promise<UsuarioListadoEntidad | null> {
    if (contexto.posiciones.has(idPosicion)) {
      return contexto.posiciones.get(idPosicion) ?? null;
    }
    const posicion = await this.usuarios.obtenerPorSkEmpleado(idPosicion);
    contexto.posiciones.set(idPosicion, posicion);
    return posicion;
  }

  private async obtenerInforme(
    idInforme: number,
    contexto: ContextoValidacion,
  ): Promise<InformeEntidad | null> {
    if (contexto.informes.has(idInforme)) {
      return contexto.informes.get(idInforme) ?? null;
    }
    const informe = await this.informes.obtenerPorSkVeo(idInforme);
    contexto.informes.set(idInforme, informe);
    return informe;
  }

  private async obtenerAsignacion(
    idPosicion: number,
    idInforme: number,
    contexto: ContextoValidacion,
  ): Promise<AsignacionActual> {
    const clave = `${idPosicion}:${idInforme}`;
    if (contexto.asignaciones.has(clave)) {
      return contexto.asignaciones.get(clave) ?? null;
    }
    const asignacion = await this.carnetOracle.obtenerAsignacion(idPosicion, idInforme);
    contexto.asignaciones.set(clave, asignacion);
    return asignacion;
  }

  private mismaFrecuencia(nueva: string, actual: string | null): boolean {
    if (actual === null) return false;
    return nueva.trim().toLowerCase() === actual.trim().toLowerCase();
  }

  private verificarLimite(cantidad: number): void {
    if (cantidad > this.maxFilas) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        `El archivo supera el máximo de ${this.maxFilas} filas permitidas.`,
        400,
      );
    }
  }

  private capitalizar(texto: string): string {
    return texto.length === 0 ? texto : `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
  }

  private mensajeError(error: unknown, operacion: OperacionCarga): string {
    if (error instanceof ExcepcionNegocio) {
      return error.mensaje;
    }
    return operacion === OperacionCarga.ASIGNACION ? 'No se pudo asignar.' : 'No se pudo eliminar.';
  }

  private aTexto(valor: unknown): string | null {
    if (valor === null || valor === undefined) return null;
    if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : null;
    if (typeof valor === 'boolean') return String(valor);
    if (typeof valor === 'string') {
      const texto = valor.trim();
      return texto.length > 0 ? texto : null;
    }
    return '[valor inválido]';
  }

  private aEntero(texto: string | null): number | null {
    if (this.vacio(texto)) return null;
    const numero = Number(texto);
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  }

  private vacio(texto: string | null): boolean {
    return texto === null || texto.trim().length === 0;
  }

  private normalizarFrecuencia(texto: string | null): string | null {
    if (this.vacio(texto)) return null;
    const objetivo = (texto as string).trim().toLowerCase();
    return FRECUENCIAS_VALIDAS.find((f) => f.toLowerCase() === objetivo) ?? null;
  }
}
