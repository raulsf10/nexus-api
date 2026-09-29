import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequiereModulo } from '../../comun/decoradores/requiere-modulo.decorator';
import { UsuarioActual } from '../../comun/decoradores/usuario-actual.decorator';
import { UsuarioJwtInterface } from '../../comun/interfaces/usuario-jwt.interface';
import { RequiereModuloGuard } from '../autenticacion/guardias/requiere-modulo.guard';
import { MODULO_EXCEPCIONES_CARNET } from './excepciones-carnet.constantes';
import { ConsultarExcepcionesCarnetDto } from './dto/consultar-excepciones-carnet.dto';
import { GuardarExcepcionCarnetDto } from './dto/guardar-excepcion-carnet.dto';
import { ExcepcionesCarnetService } from './excepciones-carnet.service';

@ApiTags('Excepciones de carnet')
@ApiBearerAuth()
@UseGuards(RequiereModuloGuard)
@RequiereModulo(MODULO_EXCEPCIONES_CARNET)
@Controller('excepciones-carnet')
export class ExcepcionesCarnetController {
  constructor(private readonly servicio: ExcepcionesCarnetService) {}

  @Get()
  @ApiOperation({ summary: 'Consulta paginada de excepciones de CARNET.' })
  consultar(@Query() dto: ConsultarExcepcionesCarnetDto) {
    return this.servicio.consultar(dto);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crea una regla que oculta un informe en CARNET.' })
  crear(@Body() dto: GuardarExcepcionCarnetDto, @UsuarioActual() usuario: UsuarioJwtInterface) {
    return this.servicio.crear(dto, usuario);
  }

  @Patch(':idExcepcion')
  @ApiOperation({ summary: 'Actualiza una excepción existente.' })
  actualizar(
    @Param('idExcepcion', ParseIntPipe) idExcepcion: number,
    @Body() dto: GuardarExcepcionCarnetDto,
    @UsuarioActual() usuario: UsuarioJwtInterface,
  ) {
    return this.servicio.actualizar(idExcepcion, dto, usuario);
  }

  @Delete(':idExcepcion')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Elimina una excepción.' })
  eliminar(@Param('idExcepcion', ParseIntPipe) idExcepcion: number) {
    return this.servicio.eliminar(idExcepcion);
  }
}
