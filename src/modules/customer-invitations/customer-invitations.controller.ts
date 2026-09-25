import {
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CustomerInvitationsService } from './customer-invitations.service';

@ApiTags('customer-invitations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.CUSTOMER)
@Controller('customer-invitations')
export class CustomerInvitationsController {
  constructor(
    private readonly customerInvitationsService: CustomerInvitationsService,
  ) {}

  @Get('my')
  findMy(@CurrentUser() user: { id: string; mobileNumber: string }) {
    return this.customerInvitationsService.findMy(user);
  }

  @Post(':id/accept')
  accept(
    @CurrentUser() user: { id: string; mobileNumber: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerInvitationsService.accept(user, id);
  }

  @Post(':id/reject')
  reject(
    @CurrentUser() user: { id: string; mobileNumber: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customerInvitationsService.reject(user, id);
  }
}
