import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsEnum, IsIn } from 'class-validator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { CodigosError } from '../../comun/enums/codigos-error.enum';
import { ExcepcionNegocio } from '../../comun/excepciones/excepcion-negocio';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { CargaMasivaService } from './carga-masiva.service';
import { EXTENSION_ARCHIVO_VALIDA, TAMANO_MAXIMO_ARCHIVO_BYTES } from './carga-masiva.constantes';
import { LoteFilasDto } from './dto/lote-filas.dto';
import { ValidarArchivoDto } from './dto/validar-archivo.dto';
import { ResultadoProceso } from './interfaces/resultado-proceso.interface';
import { ResultadoValidacion } from './interfaces/resultado-validacion.interface';
import { LectorExcelService } from './lector-excel.service';
import { OperacionCarga } from './enums/operacion-carga.enum';

export class DescargarPlantillaCargaDto {
  @ApiPropertyOptional({ enum: ['carnet', 'indicadores'], default: 'carnet' })
  @IsIn(['carnet', 'indicadores'])
  tipo: 'carnet' | 'indicadores' = 'carnet';

  @ApiPropertyOptional({ enum: OperacionCarga, default: OperacionCarga.ASIGNACION })
  @IsEnum(OperacionCarga)
  operacion: OperacionCarga = OperacionCarga.ASIGNACION;
}

interface ArchivoSubido {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Carga masiva')
@ApiBearerAuth()
@Controller('carga-masiva')
@UseGuards(RequiereModuloGuard)
export class CargaMasivaController {
  constructor(
    private readonly servicio: CargaMasivaService,
    private readonly lectorExcel: LectorExcelService,
  ) {}

  @Get('plantilla')
  @ApiOperation({ summary: 'Descarga la plantilla del movimiento seleccionado.' })
  async plantilla(@Query() dto: DescargarPlantillaCargaDto): Promise<StreamableFile> {
    const contenido = await this.lectorExcel.crearPlantilla(dto.tipo, dto.operacion);
    return new StreamableFile(contenido, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: `attachment; filename="plantilla-${dto.tipo}-${dto.operacion}.xlsx"`,
      length: contenido.length,
    });
  }

  @Post('validar')
  @RequiereModulo('Veo Carnet')
  @HttpCode(HttpStatus.OK)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Parsea y valida el Excel fila por fila sin persistir nada.' })
  @UseInterceptors(
    FileInterceptor('archivo', { limits: { fileSize: TAMANO_MAXIMO_ARCHIVO_BYTES } }),
  )
  async validar(
    @UploadedFile() archivo: ArchivoSubido | undefined,
    @Body() dto: ValidarArchivoDto,
  ): Promise<ResultadoValidacion> {
    if (!archivo) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'No se recibió ningún archivo.',
        400,
      );
    }
    if (!archivo.originalname.toLowerCase().endsWith(EXTENSION_ARCHIVO_VALIDA)) {
      throw new ExcepcionNegocio(
        CodigosError.ARCHIVO_INVALIDO,
        'El archivo debe tener extensión .xlsx.',
        400,
      );
    }
    return this.servicio.validarArchivo(dto.operacion, archivo.buffer);
  }

  @Post('revalidar')
  @RequiereModulo('Veo Carnet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-valida filas corregidas manualmente en la vista previa.' })
  async revalidar(@Body() dto: LoteFilasDto): Promise<ResultadoValidacion> {
    return this.servicio.revalidar(dto.operacion, dto.filas);
  }

  @Post('procesar')
  @RequiereModulo('Veo Carnet')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ejecuta la carga (asignación o eliminación) de las filas válidas.' })
  async procesar(
    @Body() dto: LoteFilasDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ): Promise<ResultadoProceso> {
    return this.servicio.procesar(dto.operacion, dto.filas, usuario.usuario);
  }
}
