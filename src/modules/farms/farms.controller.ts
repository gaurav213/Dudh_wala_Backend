import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../../common/enums';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CreateFarmDto, UpdateFarmDto } from './dto/farm.dto';
import { CreateFarmReviewDto } from './dto/farm-review.dto';
import { FarmDashboardService } from './farm-dashboard.service';
import { FarmsService } from './farms.service';

@ApiTags('farms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('farms')
export class FarmsController {
  constructor(
    private readonly farmsService: FarmsService,
    private readonly farmDashboardService: FarmDashboardService,
  ) {}

  @Post()
  @Roles(UserRole.FARM_OWNER)
  create(
    @CurrentUser() user: { id: string; role: UserRole; mobileNumber: string },
    @Body() dto: CreateFarmDto,
  ) {
    return this.farmsService.createFarmForOwner(user, dto, user.mobileNumber);
  }

  @Get('my')
  @Roles(UserRole.FARM_OWNER)
  myFarms(@CurrentUser('id') userId: string) {
    return this.farmsService.listMyFarms(userId);
  }

  @Get('my/dashboard')
  @Roles(UserRole.FARM_OWNER)
  myDashboard(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('date') date?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.farmDashboardService.myDashboard(user, { date, from, to });
  }

  @Get(':id')
  @Roles(
    UserRole.FARM_OWNER,
    UserRole.PLATFORM_OWNER,
    UserRole.DELIVERY_STAFF,
    UserRole.CUSTOMER,
  )
  getOne(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.getFarm(user, id);
  }

  @Patch(':id')
  @Roles(UserRole.FARM_OWNER)
  update(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFarmDto,
  ) {
    return this.farmsService.updateFarm(user, id, dto);
  }

  @Get(':id/media')
  @Roles(UserRole.FARM_OWNER)
  listMedia(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.listMedia(user, id);
  }

  @Post(':id/media')
  @Roles(UserRole.FARM_OWNER)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['photo'],
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  addMedia(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() photo: Express.Multer.File,
  ) {
    return this.farmsService.addMedia(user, id, photo);
  }

  @Delete(':id/media/:mediaId')
  @Roles(UserRole.FARM_OWNER)
  deleteMedia(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('mediaId', ParseUUIDPipe) mediaId: string,
  ) {
    return this.farmsService.deleteMedia(user, id, mediaId);
  }

  @Post(':id/reviews')
  @Roles(UserRole.CUSTOMER)
  createReview(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateFarmReviewDto,
  ) {
    return this.farmsService.createFarmReview(user, id, dto);
  }

  @Get(':farmId/members')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  members(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('farmId', ParseUUIDPipe) farmId: string,
  ) {
    return this.farmsService.listMembers(user, farmId);
  }

  @Post(':id/deactivate')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  deactivate(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.deactivate(user, id);
  }

  @Post(':id/request-deletion')
  @Roles(UserRole.FARM_OWNER, UserRole.PLATFORM_OWNER)
  requestDeletion(
    @CurrentUser() user: { id: string; role: UserRole },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.farmsService.requestDeletion(user, id);
  }
}
