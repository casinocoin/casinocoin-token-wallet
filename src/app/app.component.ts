import { Component } from '@angular/core';
import { ElectronService } from './providers/electron.service';
import { LogService } from './providers/log.service';
import { TranslateService } from '@ngx-translate/core';
import { AppConfig } from '../environments/environment';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  constructor( public electronService: ElectronService,
               private translate: TranslateService,
               private logger: LogService ) {
    translate.setDefaultLang('en');
    this.logger.debug('### AppConfig: ' + JSON.stringify(AppConfig));

    if (electronService.isElectron()) {
      this.logger.debug('### AppComponent - Mode electron');
      this.logger.debug('### AppComponent - Electron ipcRenderer: ' + JSON.stringify(electronService.ipcRenderer));
      this.logger.debug('### AppComponent - NodeJS childProcess: ' + JSON.stringify(electronService.childProcess));
    } else {
      this.logger.debug('### AppComponent - Mode web');
    }
  }
}
