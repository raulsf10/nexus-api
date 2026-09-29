import {
  Controller,
  Body,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { CrearSolicitudCarnetDto } from './dto/crear-solicitud-carnet.dto';
import { ConsultarSolicitudesCarnetDto } from './dto/consultar-solicitudes-carnet.dto';
import { RevisarSolicitudCarnetDto } from './dto/revisar-solicitud-carnet.dto';
import {
  MODULO_SEGUIMIENTO_SOLICITUDES_CARNET,
  MODULO_SOLICITUDES_CARNET,
  TAMANO_MAXIMO_ARCHIVO_SOLICITUD_BYTES,
} from './solicitudes-carnet.constantes';
import { ArchivoSubidoSolicitud, SolicitudesCarnetService } from './solicitudes-carnet.service';

interface ArchivosSolicitudRecibidos {
  archivoSolicitud?: ArchivoSubidoSolicitud[];
  vobo?: ArchivoSubidoSolicitud[];
}

@ApiTags('Solicitudes de carnet')
@ApiBearerAuth()
@Controller('solicitudes-carnet')
export class SolicitudesCarnetController {
  constructor(private readonly servicio: SolicitudesCarnetService) {}

  @Get()
  @ApiOperation({
    summary: 'Consulta las solicitudes propias o todas las que requieren seguimiento.',
  })
  async consultar(
    @Query() dto: ConsultarSolicitudesCarnetDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.consultar(dto, usuario);
  }

  @Get('versiones/:idVersion/archivo-solicitud')
  @ApiOperation({ summary: 'Descarga el Excel enviado en una versión de solicitud.' })
  async descargarSolicitud(
    @Param('idVersion', ParseIntPipe) idVersion: number,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<StreamableFile> {
    const archivo = await this.servicio.obtenerArchivo(idVersion, 'solicitud', usuario);
    return this.archivoDescargable(archivo.contenido, archivo.nombre, archivo.tipo);
  }

  @Get('versiones/:idVersion/vobo')
  @ApiOperation({ summary: 'Descarga el VoBo enviado en una versión de solicitud.' })
  async descargarVobo(
    @Param('idVersion', ParseIntPipe) idVersion: number,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<StreamableFile> {
    const archivo = await this.servicio.obtenerArchivo(idVersion, 'vobo', usuario);
    return this.archivoDescargable(archivo.contenido, archivo.nombre, archivo.tipo);
  }

  @Get(':idSolicitud')
  @ApiOperation({ summary: 'Obtiene una solicitud con versiones y filas.' })
  async obtenerDetalle(
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.obtenerDetalle(idSolicitud, usuario);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RequiereModuloGuard)
  @RequiereModulo(MODULO_SOLICITUDES_CARNET)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Crea una solicitud de asignación o eliminación con su Excel y VoBo.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'archivoSolicitud', maxCount: 1 },
        { name: 'vobo', maxCount: 1 },
      ],
      { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_SOLICITUD_BYTES } },
    ),
  )
  async crear(
    @Body() dto: CrearSolicitudCarnetDto,
    @UploadedFiles() archivos: ArchivosSolicitudRecibidos,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.crear(
      dto,
      this.archivoRequerido(archivos, 'archivoSolicitud', 'la plantilla Excel'),
      this.archivoRequerido(archivos, 'vobo', 'el VoBo'),
      usuario,
    );
  }

  @Post(':idSolicitud/versiones')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(RequiereModuloGuard)
  @RequiereModulo(MODULO_SOLICITUDES_CARNET)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Carga una nueva versión después de una aprobación parcial.' })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'archivoSolicitud', maxCount: 1 },
        { name: 'vobo', maxCount: 1 },
      ],
      { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_SOLICITUD_BYTES } },
    ),
  )
  async crearNuevaVersion(
    @Param('idSolicitud', ParseIntPipe) idSolicitud: number,
    @Body() dto: CrearSolicitudCarnetDto,
    @UploadedFiles() archivos: ArchivosSolicitudRecibidos,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.crearNuevaVersion(
      idSolicitud,
      dto,
      this.archivoRequerido(archivos, 'archivoSolicitud', 'la plantilla Excel'),
      this.archivoRequerido(archivos, 'vobo', 'el VoBo'),
      usuario,
    );
  }

  @Patch('versiones/:idVersion/revision')
  @UseGuards(RequiereModuloGuard)
  @RequiereModulo(MODULO_SEGUIMIENTO_SOLICITUDES_CARNET)
  @ApiOperation({ summary: 'Aprueba todas, algunas o ninguna de las filas de una versión.' })
  async revisar(
    @Param('idVersion', ParseIntPipe) idVersion: number,
    @Body() dto: RevisarSolicitudCarnetDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.revisar(idVersion, dto, usuario);
  }

  private archivoRequerido(
    archivos: ArchivosSolicitudRecibidos,
    nombre: keyof ArchivosSolicitudRecibidos,
    descripcion: string,
  ): ArchivoSubidoSolicitud {
    const archivo = archivos[nombre]?.[0];
    if (!archivo) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        `Debe adjuntar ${descripcion}.`,
        400,
      );
    }
    return archivo;
  }

  private archivoDescargable(contenido: Buffer, nombre: string, tipo: string): StreamableFile {
    return new StreamableFile(contenido, {
      type: tipo,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    });
  }
}
