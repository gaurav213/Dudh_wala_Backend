import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { APP_TIMEZONE, currentHourIst } from '../../common/utils/date.util';
import { DeliveriesService } from './deliveries.service';

/**
 * Auto-generates each farm’s daily delivery list in the IST morning window.
 * Runs every 15 minutes from 04:00–10:59 IST; per-farm generation is idempotent
 * via `last_daily_list_generated_date`.
 */
@Injectable()
export class DailyListSchedulerService {
  private readonly logger = new Logger(DailyListSchedulerService.name);

  constructor(private readonly deliveries: DeliveriesService) {}

  @Cron('0 */15 * * * *', { timeZone: APP_TIMEZONE })
  async handleMorningGenerate() {
    const hour = currentHourIst();
    if (hour < 4 || hour > 10) {
      return;
    }
    const summary = await this.deliveries.runScheduledDailyListGeneration();
    if (summary.generated > 0 || summary.failed > 0) {
      this.logger.log(
        `Daily list cron: considered=${summary.farmsConsidered} generated=${summary.generated} skipped=${summary.skipped} failed=${summary.failed}`,
      );
    }
  }
}
