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

  private languageSystem;
  private languages;

  constructor( public electronService: ElectronService,
               private translate: TranslateService,
               private logger: LogService ) {

     this.languages = [
                  {name: 'English', value: 'en'},
                  {name: 'Portuguese', value: 'po'},
                  {name: 'Español', value: 'es'},
                  {name: 'German', value: 'gr'},
                ];
    // translate.setDefaultLang('en');
    this.logger.debug('### AppConfig: ' + JSON.stringify(AppConfig));

    if (electronService.isElectron()) {
      this.logger.debug('### AppComponent - Mode electron');
      this.logger.debug('### AppComponent - Electron ipcRenderer: ' + JSON.stringify(electronService.ipcRenderer));
      this.logger.debug('### AppComponent - NodeJS childProcess: ' + JSON.stringify(electronService.childProcess));
    } else {
      this.logger.debug('### AppComponent - Mode web');
    }
    this.getSystemLanguage();
  }
  getSystemLanguage() {
    const lg = this.electronService.remote.app.getLocale();
    const ln = lg[0] + lg[1];
    this.languageSystem = this.languages.find(item => item.value === ln);
    if (this.languageSystem) {
      this.translate.setDefaultLang(this.languageSystem.value);
    } else { this.translate.setDefaultLang('en'); this.languageSystem = {name: 'English', value: 'en'}; }
  } 
}
