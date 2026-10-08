import { Controller, Get } from '@nestjs/common';
import { APP_VERSION } from './version';

@Controller('health')
export class HealthController {
  @Get()
  health() {
    return { status: 'ok', service: 'maktaba-portable-api', version: APP_VERSION };
  }
}
