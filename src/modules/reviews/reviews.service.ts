import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConnectionStatus,
  DeliveryStatus,
  FarmMemberStatus,
  NotificationType,
  ReviewStatus,
  UserRole,
} from '../../common/enums';
import { assertFound } from '../../common/utils/ownership.util';
import { FarmCustomerConnection } from '../connections/entities/farm-customer-connection.entity';
import { MilkDelivery } from '../deliveries/entities/milk-delivery.entity';
import { FarmMember } from '../farms/entities/farm-member.entity';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateCustomerReviewDto,
  ReportReviewDto,
  RespondReviewDto,
} from './dto/review.dto';
import { CustomerReview } from './entities/customer-review.entity';

@Injectable()
export class ReviewsService {
  constructor(
    @InjectRepository(CustomerReview)
    private readonly reviewsRepo: Repository<CustomerReview>,
    @InjectRepository(MilkDelivery)
    private readonly deliveriesRepo: Repository<MilkDelivery>,
    @InjectRepository(FarmMember)
    private readonly membersRepo: Repository<FarmMember>,
    @InjectRepository(FarmCustomerConnection)
    private readonly connectionsRepo: Repository<FarmCustomerConnection>,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    user: { id: string; role: UserRole },
    dto: CreateCustomerReviewDto,
  ) {
    if (
      user.role !== UserRole.DELIVERY_STAFF &&
      user.role !== UserRole.FARM_OWNER
    ) {
      throw new ForbiddenException('Only farm staff can review customers');
    }

    const member = await this.membersRepo.findOne({
      where: {
        farmId: dto.farmId,
        userId: user.id,
        status: FarmMemberStatus.ACTIVE,
      },
    });
    if (!member && user.role !== UserRole.FARM_OWNER) {
      throw new ForbiddenException('Not a member of this farm');
    }

    const connection = await this.connectionsRepo.findOne({
      where: {
        farmId: dto.farmId,
        customerUserId: dto.customerUserId,
        status: ConnectionStatus.ACTIVE,
      },
    });
    if (!connection) {
      throw new BadRequestException('Customer is not connected to this farm');
    }

    const deliveredCount = await this.deliveriesRepo.count({
      where: {
        farmId: dto.farmId,
        customerUserId: dto.customerUserId,
        status: DeliveryStatus.DELIVERED,
        ...(user.role === UserRole.DELIVERY_STAFF
          ? { deliveredByUserId: user.id }
          : {}),
      },
    });
    if (deliveredCount < 1) {
      throw new BadRequestException(
        'Complete at least one delivery for this customer before reviewing',
      );
    }

    const review = await this.reviewsRepo.save(
      this.reviewsRepo.create({
        farmId: dto.farmId,
        customerUserId: dto.customerUserId,
        createdByUserId: user.id,
        deliveryId: dto.deliveryId ?? null,
        subscriptionId: dto.subscriptionId ?? null,
        rating: dto.rating,
        communicationRating: dto.communicationRating ?? null,
        addressAccuracyRating: dto.addressAccuracyRating ?? null,
        paymentReliabilityRating: dto.paymentReliabilityRating ?? null,
        comment: dto.comment ?? null,
        status: ReviewStatus.PUBLISHED,
      }),
    );

    await this.notifications.notify({
      type: NotificationType.CUSTOMER_REVIEW_ADDED,
      title: 'New customer review',
      body: 'Your dairy left a review for you.',
      messageKey: 'notifReviewAdded',
      recipientUserIds: [dto.customerUserId],
      route: '/customer/reviews/received',
      farmId: dto.farmId,
      entityType: 'CUSTOMER_REVIEW',
      entityId: review.id,
      createdByUserId: user.id,
    });

    return review;
  }

  async listForCustomer(customerUserId: string) {
    return this.reviewsRepo.find({
      where: { customerUserId, status: ReviewStatus.PUBLISHED },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }

  async respond(
    user: { id: string; role: UserRole },
    id: string,
    dto: RespondReviewDto,
  ) {
    const review = assertFound(
      await this.reviewsRepo.findOne({ where: { id } }),
      'Review not found',
    );
    if (review.customerUserId !== user.id) {
      throw new ForbiddenException();
    }
    review.customerResponse = dto.response;
    return this.reviewsRepo.save(review);
  }

  async report(
    user: { id: string; role: UserRole },
    id: string,
    dto: ReportReviewDto,
  ) {
    const review = assertFound(
      await this.reviewsRepo.findOne({ where: { id } }),
      'Review not found',
    );
    if (review.customerUserId !== user.id) {
      throw new ForbiddenException();
    }
    review.status = ReviewStatus.REPORTED;
    review.reportedAt = new Date();
    review.reportReason = dto.reason;
    await this.reviewsRepo.save(review);
    await this.notifications.notify({
      type: NotificationType.CUSTOMER_REVIEW_REPORTED,
      title: 'Review reported',
      body: 'A customer reported a review for moderation.',
      messageKey: 'notifReviewReported',
      recipientUserIds: [review.createdByUserId],
      farmId: review.farmId,
      entityType: 'CUSTOMER_REVIEW',
      entityId: review.id,
      createdByUserId: user.id,
    });
    return review;
  }
}
