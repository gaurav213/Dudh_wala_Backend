import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  CreateCustomerReviewDto,
  ReportReviewDto,
  RespondReviewDto,
} from './dto/review.dto';
import { ReviewsService } from './reviews.service';

@ApiTags('customer-reviews')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Roles(UserRole.DELIVERY_STAFF, UserRole.FARM_OWNER)
  @Post('customer-reviews')
  create(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateCustomerReviewDto,
  ) {
    return this.reviews.create(user, dto);
  }

  @Get('customers/:customerId/reviews')
  list(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.reviews.listForCustomer(customerId);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('customer-reviews/:id/respond')
  respond(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondReviewDto,
  ) {
    return this.reviews.respond(user, id, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('customer-reviews/:id/report')
  report(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviews.report(user, id, dto);
  }
}
