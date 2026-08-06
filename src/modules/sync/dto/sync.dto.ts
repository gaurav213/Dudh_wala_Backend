import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class SyncPushOperationDto {
  @ApiProperty()
  @IsUUID()
  operationId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  deviceId!: string;

  @ApiProperty({
    enum: ['CUSTOMER', 'SUBSCRIPTION', 'DELIVERY', 'PAYMENT'],
  })
  @IsIn(['CUSTOMER', 'SUBSCRIPTION', 'DELIVERY', 'PAYMENT'])
  entityType!: 'CUSTOMER' | 'SUBSCRIPTION' | 'DELIVERY' | 'PAYMENT';

  @ApiProperty()
  @IsUUID()
  entityId!: string;

  @ApiProperty({ enum: ['CREATE', 'UPDATE', 'DELETE'] })
  @IsIn(['CREATE', 'UPDATE', 'DELETE'])
  operationType!: 'CREATE' | 'UPDATE' | 'DELETE';

  @ApiProperty()
  @IsInt()
  @Min(0)
  baseVersion!: number;

  @ApiProperty()
  @IsDateString()
  clientUpdatedAt!: string;

  @ApiProperty()
  @IsObject()
  payload!: Record<string, unknown>;
}

export class SyncPushDto {
  @ApiProperty({ type: [SyncPushOperationDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncPushOperationDto)
  operations!: SyncPushOperationDto[];
}

export class SyncPullQueryDto {
  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  cursor = 0;
}
