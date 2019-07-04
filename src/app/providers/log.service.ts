import { Injectable } from '@angular/core';
import { NGXLogger } from 'ngx-logger';
import { ElectronService } from './electron.service';

@Injectable()
export class LogService {

    electronLogger: any;
    loglevel = 'error';

    constructor(private logger: NGXLogger,
                private electronService: ElectronService
                ) {
        this.logger.debug('### INIT LogService');
        this.electronLogger = this.electronService.remote.getGlobal('logger');
        this.loglevel = this.electronService.remote.getGlobal('loglevel');
        this.logger.debug('### LogLevel: ' + this.loglevel);
    }

    debug(content: string) {
        // write debug log
        if (this.loglevel === 'debug') {
            this.logger.debug(content);
            this.electronLogger.log('debug', content);
        }
    }

    info(content: string) {
        // write info log
        if (this.loglevel === 'debug' || this.loglevel === 'info') {
            this.logger.info(content);
            this.electronLogger.log('info', content);
        }
    }

    error(content: string) {
        // write error log
        if (this.loglevel === 'debug' || this.loglevel === 'info' || this.loglevel === 'error') {
            this.logger.error(content);
            this.electronLogger.log('error', content);
        }
    }
}
