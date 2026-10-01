import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import {
  BuscarFoliosJtracDto,
  ConsultarFolioJtracDto,
  ConsultarRelacionesJtracDto,
  ConsultarReporteJtracDto,
  GuardarRelacionJtracDto,
} from './dto/jtrac-pdi.dto';
import { MODULO_GESTION_JTRAC_PDI } from './jtrac-pdi.constantes';
import { JtracPdiService } from './jtrac-pdi.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { CargaIndicadoresService } from './carga-indicadores.service';
import { JtracPdiHistorialRepository } from './jtrac-pdi-historial.repository';
import { ConsultarHistorialIndicadoresDto } from './dto/consultar-historial-indicadores.dto';
import { LoteIndicadoresDto } from './dto/carga-indicadores.dto';
import { ValidarArchivoDto } from '../carga-masiva/dto/validar-archivo.dto';
import { TAMANO_MAXIMO_ARCHIVO_BYTES } from '../carga-masiva/carga-masiva.constantes';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { CodigosError } from '../../comun/enums/codigos-error.enum';

@ApiTags('Relaciones JTRAC–PDI')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@Controller('jtrac-pdi')
export class JtracPdiController {
  constructor(
    private readonly servicio: JtracPdiService,
    private readonly carga: CargaIndicadoresService,
    private readonly historial: JtracPdiHistorialRepository,
  ) {}

  @Get('historial')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  consultarHistorial(@Query() dto: ConsultarHistorialIndicadoresDto) {
    return this.historial.consultar(dto);
  }

  @Post('carga-masiva/validar')
  @HttpCode(200)
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_BYTES } }),
  )
  validarCarga(
    @Body() dto: ValidarArchivoDto,
    @UploadedFile() archivo?: { originalname: string; buffer: Buffer },
  ) {
    if (!archivo?.originalname.toLowerCase().endsWith('.xlsx')) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'Selecciona un archivo .xlsx.',
        400,
      );
    }
    return this.carga.validarArchivo(dto.operacion, archivo.buffer);
  }

  @Post('carga-masiva/revalidar')
  @HttpCode(200)
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  revalidarCarga(@Body() dto: LoteIndicadoresDto) {
    return this.carga.validar(dto.operacion, dto.filas);
  }

  @Post('carga-masiva/procesar')
  @HttpCode(200)
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  procesarCarga(@Body() dto: LoteIndicadoresDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.carga.procesar(dto.operacion, dto.filas, usuario.usuario);
  }

  @Get('estado')
  estado(@UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.estado(usuario);
  }

  @Get('reporte')
  reporte(@Query() dto: ConsultarReporteJtracDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.reporte(dto, usuario);
  }

  @Get('folios')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  folios(@Query() dto: BuscarFoliosJtracDto) {
    return this.servicio.buscarFolios(dto.busqueda);
  }

  @Get('indicadores')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  indicadores(@Query() dto: ConsultarFolioJtracDto) {
    return this.servicio.indicadores(dto.folioJtrac);
  }

  @Get('relaciones')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  consultar(@Query() dto: ConsultarRelacionesJtracDto) {
    return this.servicio.consultar(dto);
  }

  @Post('relaciones')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  crear(@Body() dto: GuardarRelacionJtracDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.crear(dto, usuario);
  }

  @Patch('relaciones/:idRelacion')
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  actualizar(
    @Param('idRelacion', ParseIntPipe) idRelacion: number,
    @Body() dto: GuardarRelacionJtracDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.actualizar(idRelacion, dto, usuario);
  }

  @Delete('relaciones/:idRelacion')
  @HttpCode(204)
  @RequiereModulo(MODULO_GESTION_JTRAC_PDI)
  eliminar(
    @Param('idRelacion', ParseIntPipe) idRelacion: number,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.eliminar(idRelacion, usuario);
  }
}
