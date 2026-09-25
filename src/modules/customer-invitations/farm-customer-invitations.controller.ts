import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomerInvitationsService } from './customer-invitations.service';
import {
  CreateCustomerInvitationDto,
  ListCustomerInvitationsDto,
} from './dto/customer-invitation.dto';

@ApiTags('customer-invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
@Controller('farms/:farmId/customer-invitations')
export class FarmCustomerInvitationsController {
  constructor(
    private readonly customerInvitationsService: CustomerInvitationsService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: CreateCustomerInvitationDto,
  ) {
    return this.customerInvitationsService.create(user, farmId, dto);
  }

  @Get()
  listForFarm(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query() query: ListCustomerInvitationsDto,
  ) {
    return this.customerInvitationsService.listForFarm(user, farmId, query);
  }

  @Post(':id/cancel')
  cancel(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerInvitationsService.cancel(user, farmId, id);
  }
}
