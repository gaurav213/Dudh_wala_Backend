import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { buildPageMeta } from '../../common/utils/pagination.util';
import { User } from '../users/entities/user.entity';
import { ListAuditLogsDto } from './dto/list-audit-logs.dto';
import { AuditLog } from './entities/audit-log.entity';

const SENSITIVE_KEYS = [
  'password',
  'passwordHash',
  'token',
  'accessToken',
  'refreshToken',
  'tokenHash',
];

function scrub(values?: Record<string, unknown> | null) {
  if (!values) return null;
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      SENSITIVE_KEYS.some((k) => key.toLowerCase().includes(k.toLowerCase()))
    ) {
      continue;
    }
    cleaned[key] = value;
  }
  return cleaned;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async log(params: {
    actorUserId?: string | null;
    supplierId?: string | null;
    farmId?: string | null;
    entityType: string;
    entityId?: string | null;
    action: string;
    oldValues?: Record<string, unknown> | null;
    newValues?: Record<string, unknown> | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    const entry = this.auditRepo.create({
      actorUserId: params.actorUserId ?? null,
      supplierId: params.supplierId ?? null,
      farmId: params.farmId ?? null,
      entityType: params.entityType,
      entityId: params.entityId ?? null,
      action: params.action,
      oldValues: scrub(params.oldValues),
      newValues: scrub(params.newValues),
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
    });
    await this.auditRepo.save(entry);
  }

  async listForAdmin(query: ListAuditLogsDto) {
    const qb = this.auditRepo.createQueryBuilder('a');

    if (query.action) {
      qb.andWhere('a.action ILIKE :action', { action: `%${query.action}%` });
    }
    if (query.entityType) {
      qb.andWhere('a.entity_type = :entityType', {
        entityType: query.entityType,
      });
    }
    if (query.actorId) {
      qb.andWhere('a.actor_user_id = :actorId', { actorId: query.actorId });
    }
    if (query.from) {
      qb.andWhere('a.created_at >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('a.created_at <= :to', { to: new Date(query.to) });
    }

    qb.orderBy('a.created_at', query.sortOrder || 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const actorIds = [
      ...new Set(
        rows
          .map((r) => r.actorUserId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const actors =
      actorIds.length > 0
        ? await this.usersRepo
            .createQueryBuilder('u')
            .where('u.id IN (:...ids)', { ids: actorIds })
            .getMany()
        : [];
    const actorMap = new Map(actors.map((a) => [a.id, a]));

    const data = rows.map((row) => {
      const actor = row.actorUserId ? actorMap.get(row.actorUserId) : undefined;
      return {
        id: row.id,
        actorName: actor?.name ?? 'System',
        actorRole: actor?.role ?? 'SYSTEM',
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId ?? '',
        createdAt: row.createdAt,
        ipAddress: row.ipAddress,
        metadata: {
          oldValues: row.oldValues,
          newValues: row.newValues,
        },
      };
    });

    return { data, meta: buildPageMeta(query.page, query.limit, total) };
  }
}
