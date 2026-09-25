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
import { DeliveryExtraRequestsService } from './delivery-extra-requests.service';
import { DeliveryOpsService } from './delivery-ops.service';
import {
  AddStaffExtraDto,
  CreateAdHocExtraDeliveryDto,
  CreateExtraRequestDto,
  CustomerConfirmDto,
  CustomerIssueDto,
  CustomerSkipDayDto,
  EditDeliveryDto,
  EditReviewDto,
  FarmSkipTodayDto,
  MarkDeliveredDto,
  ResolveDeliveryIssueDto,
  ReviewExtraRequestDto,
  SkipCancelFailDto,
} from './dto/delivery-ops.dto';
import { GenerateDailyListDto } from './dto/delivery.dto';
import { DeliveriesService } from './deliveries.service';

@ApiTags('delivery-ops')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DeliveryOpsController {
  constructor(
    private readonly ops: DeliveryOpsService,
    private readonly extras: DeliveryExtraRequestsService,
    private readonly deliveries: DeliveriesService,
  ) {}

  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  @Post('farms/:farmId/deliveries/generate-daily-list')
  generateForFarm(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: GenerateDailyListDto,
  ) {
    return this.deliveries.generateDailyListForFarm(user, farmId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('farms/:farmId/deliveries/skip-today')
  farmSkipToday(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Body() dto: FarmSkipTodayDto,
  ) {
    return this.ops.farmSkipToday(user, farmId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Get('farms/:farmId/deliveries/daily-list-status')
  dailyListStatus(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
    @Query('date') date?: string,
  ) {
    return this.deliveries.getDailyListStatus(user, farmId, date);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/ad-hoc-extra')
  createAdHocExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateAdHocExtraDeliveryDto,
  ) {
    return this.ops.createAdHocExtraDelivery(user, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/out-for-delivery')
  outForDelivery(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.ops.outForDelivery(user, deliveryId);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/add-extra')
  addExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: AddStaffExtraDto,
  ) {
    return this.ops.addStaffExtra(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Get('delivery-issues/open')
  openIssues(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.ops.listOpenIssues(user);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('delivery-issues/:issueId/resolve')
  resolveIssue(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('issueId', ParseUUIDPipe) issueId: string,
    @Body() dto: ResolveDeliveryIssueDto,
  ) {
    return this.ops.resolveIssue(user, issueId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/delivered')
  delivered(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: MarkDeliveredDto,
  ) {
    return this.ops.markDelivered(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/edit')
  editDelivery(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: EditDeliveryDto,
  ) {
    return this.ops.editDelivery(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/edit-review/confirm')
  confirmEditReview(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: EditReviewDto,
  ) {
    return this.ops.confirmEditReview(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/edit-review/flag')
  flagEditReview(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: EditReviewDto,
  ) {
    return this.ops.flagEditReview(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  @Get('deliveries/:deliveryId/edit-review')
  editReviewDetail(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.ops.getEditReviewDetail(user, deliveryId);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/skipped')
  skipped(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: SkipCancelFailDto,
  ) {
    return this.ops.skip(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/cancelled')
  cancelled(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: SkipCancelFailDto,
  ) {
    return this.ops.cancel(user, deliveryId, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('deliveries/:deliveryId/failed')
  failed(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: SkipCancelFailDto,
  ) {
    return this.ops.fail(user, deliveryId, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('me/skip-day')
  customerSkipDay(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CustomerSkipDayDto,
  ) {
    return this.ops.customerSkipDay(user, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('me/unskip-day')
  customerUnskipDay(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CustomerSkipDayDto,
  ) {
    return this.ops.customerUnskipDay(user, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('deliveries/:deliveryId/customer-skip-today')
  customerSkipToday(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: SkipCancelFailDto,
  ) {
    return this.ops.customerSkipToday(user, deliveryId, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('deliveries/:deliveryId/customer-confirm')
  customerConfirm(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CustomerConfirmDto,
  ) {
    return this.ops.customerConfirm(user, deliveryId, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('deliveries/:deliveryId/customer-mark-received')
  customerMarkReceived(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CustomerConfirmDto,
  ) {
    return this.ops.customerMarkReceived(user, deliveryId, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('deliveries/:deliveryId/customer-not-received')
  customerNotReceived(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CustomerIssueDto,
  ) {
    return this.ops.customerReportIssue(user, deliveryId, {
      ...dto,
      issueType: dto.issueType,
    });
  }

  @Roles(UserRole.CUSTOMER)
  @Post('deliveries/:deliveryId/customer-wrong-quantity')
  customerWrongQuantity(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
    @Body() dto: CustomerIssueDto,
  ) {
    return this.ops.customerReportIssue(user, deliveryId, dto);
  }

  @Roles(
    UserRole.CUSTOMER,
    UserRole.FARM_OWNER,
    UserRole.DELIVERY_STAFF,
    UserRole.PLATFORM_OWNER,
  )
  @Get('deliveries/:deliveryId/events')
  events(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('deliveryId', ParseUUIDPipe) deliveryId: string,
  ) {
    return this.ops.listEvents(user, deliveryId);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('delivery-extra-requests')
  createExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateExtraRequestDto,
  ) {
    return this.extras.create(user, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Get('delivery-extra-requests/my')
  myExtras(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.extras.myRequests(user);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Get('delivery-extra-requests/assigned')
  assignedExtras(@CurrentUser() user: { id: string; role: UserRole }) {
    return this.extras.assignedRequests(user);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('delivery-extra-requests/:id/accept')
  acceptExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewExtraRequestDto,
  ) {
    return this.extras.accept(user, id, dto);
  }

  @Roles(UserRole.FARM_OWNER, UserRole.DELIVERY_STAFF, UserRole.PLATFORM_OWNER)
  @Post('delivery-extra-requests/:id/reject')
  rejectExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewExtraRequestDto,
  ) {
    return this.extras.reject(user, id, dto);
  }

  @Roles(UserRole.CUSTOMER)
  @Post('delivery-extra-requests/:id/cancel')
  cancelExtra(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.extras.cancel(user, id);
  }
}
