import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ListSuppliersDto } from './dto/list-suppliers.dto';
import { SuppliersService } from './suppliers.service';

@ApiTags('suppliers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PLATFORM_OWNER)
@Controller('suppliers')
export class SuppliersController {
  constructor(private readonly suppliersService: SuppliersService) {}

  @Get()
  list(@Query() query: ListSuppliersDto) {
    return this.suppliersService.listForAdmin(query);
  }

  @Get(':id')
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.suppliersService.getAdminDetail(id);
  }

  @Patch(':id/activate')
  activate(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliersService.setSupplierStatus(id, 'ACTIVE', actor.id);
  }

  @Patch(':id/block')
  block(
    @CurrentUser() actor: { id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.suppliersService.setSupplierStatus(id, 'BLOCKED', actor.id);
  }
}
