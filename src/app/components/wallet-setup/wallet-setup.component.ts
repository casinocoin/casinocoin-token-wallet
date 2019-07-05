import { Component, OnInit, ViewEncapsulation, ViewChild, NgZone } from '@angular/core';
import { trigger, state, transition, style, animate } from '@angular/animations';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { ElectronService } from '../../providers/electron.service';
import { SessionStorageService, LocalStorageService } from 'ngx-store';
import { AppConstants } from '../../domains/app-constants';
import { CSCUtil } from '../../domains/csc-util';
import * as LokiTypes from '../../domains/lokijs';
import { MenuItem, MessagesModule, Message } from 'primeng/primeng';
import { UUID } from 'angular2-uuid';
import { WalletService } from '../../providers/wallet.service';
import { CSCCrypto } from '../../domains/csc-crypto';
import { setTimeout } from 'timers';
import { DatePipe, DecimalPipe } from '@angular/common';

const path = require('path');

@Component({
  selector: 'app-wallet-setup',
  templateUrl: './wallet-setup.component.html',
  styleUrls: ['./wallet-setup.component.scss'],
  encapsulation: ViewEncapsulation.None,
  animations: [
    trigger('slideInOut', [
      state('in-left', style({
        transform: 'translate3d(0, 0, 0)'
      })),
      state('in-right', style({
        transform: 'translate3d(0, 0, 0)'
      })),
      state('out', style({
        transform: 'translate3d(100%, 0, 0)'
      })),
      transition('in-left => out', animate('400ms ease-in-out')),
      transition('in-right => out', animate('400ms ease-in-out')),
      transition('out => in-left', animate('400ms ease-in-out')),
      transition('out => in-right', animate('400ms ease-in-out'))
    ])
  ]
})

export class WalletSetupComponent implements OnInit {

  showDialog: boolean;

  update_dialog_visible = false;
  autoUpdateRunning = false;
  downloadedBytes = 0;
  totalBytes = 0;
  downloadPercentage: number;
  downloadVersion = '';
  downloadCompleted = false;

  constructor( private logger: LogService,
               private electron: ElectronService,
               private router: Router,
               private localStorageService: LocalStorageService,
               private sessionStorageService: SessionStorageService,
               private walletService: WalletService,
               private datePipe: DatePipe,
               private _ngZone: NgZone,
               private decimalPipe: DecimalPipe ) {
                 this.showDialog = true;
               }

  ngOnInit() {
    this.logger.debug('### INIT WalletSetup ###');
    // generate recovery words
    this.walletService.walletSetup.recoveryMnemonicWords = CSCCrypto.getRandomMnemonic();
    // set network
    this.walletService.walletSetup.testNetwork = true;
    // generate wallet UUID
    this.walletService.walletSetup.walletUUID = UUID.UUID();
    this.logger.debug('### Wallet UUID: ' + this.walletService.walletSetup.walletUUID);
    // set backup location
    this.walletService.walletSetup.backupLocation = this.electron.remote.getGlobal('vars.backupLocation');
    this.electron.ipcRenderer.on('update-message', (event, arg) => {
      this.logger.info('### LOGIN Received Auto Update Message: ' + arg.event);
      if (arg.event === 'update-available') {
          this.logger.debug('### LOGIN Hide Dialog, Show Download');
          this._ngZone.run(() => {
              this.autoUpdateRunning = true;
              this.downloadVersion = arg.data.version;
              this.downloadPercentage = 0;
              this.showDialog = false;
              this.update_dialog_visible = true;
          });
          this.logger.debug('### LOGIN AutoUpdate: ' + JSON.stringify(arg.data));
      } else if (arg.event === 'download-progress') {
          this.logger.debug('### LOGIN Download Status: ' + JSON.stringify(arg.data));
          this._ngZone.run(() => {
              this.downloadPercentage = Number(this.decimalPipe.transform(arg.data.percent, '1.2-2'));
              this.logger.debug('### LOGIN Download Percentage: ' + this.downloadPercentage);
              this.downloadedBytes = arg.data.transferred;
              this.totalBytes = arg.data.total;
          });
      } else if (arg.event === 'update-downloaded') {
        this.logger.debug('### LOGIN Download Finished: ' + JSON.stringify(arg.data));
        this._ngZone.run(() => {
          this.downloadPercentage = 100;
          this.autoUpdateRunning = false;
          this.downloadCompleted = true;
        });
      } else if (arg.event === 'error') {
          this.logger.debug('### LOGIN AutoUpdate Error: ' + JSON.stringify(arg.data));
          this.autoUpdateRunning = false;
      }
  });
  }

  onHideSetup() {
    if (!this.autoUpdateRunning) {
      this.logger.debug('### Setup -> Quit');
      // quit the wallet
      this.electron.remote.app.quit();
      // we have no wallet yet so send the wallet-closed event
      this.electron.ipcRenderer.send('wallet-closed', true);
    }
  }

  doRestartAndInstall() {
    // in case an update was downloaded we'll do a restart and install
    this.electron.ipcRenderer.send('autoupdate-restart', true);
  }
}
