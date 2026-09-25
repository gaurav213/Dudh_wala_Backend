import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { PaginationDto } from '../../../common/dto/pagination.dto';
import { DeliveryShift, InvitationStatus } from '../../../common/enums';

export class CreateCustomerInvitationDto {
  @ApiProperty({ example: '9876543210' })
  @IsString()
  mobileNumber!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(150)
  customerName?: string;

  @ApiProperty()
  @IsUUID()
  productId!: string;

  @ApiProperty({ example: '1.500' })
  @Matches(/^\d+(\.\d{1,3})?$/)
  quantity!: string;

  @ApiProperty({ enum: DeliveryShift })
  @IsEnum(DeliveryShift)
  deliveryShift!: DeliveryShift;

  @ApiProperty({ example: '60.00' })
  @Matches(/^\d+(\.\d{1,2})?$/)
  proposedRate!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  preferredStartDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deliveryInstructions?: string;

  @ApiPropertyOptional({ default: 7, description: 'Validity in days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expiresInDays?: number;
}

export class ListCustomerInvitationsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InvitationStatus })
  @IsOptional()
  @IsEnum(InvitationStatus)
  status?: InvitationStatus;
}
