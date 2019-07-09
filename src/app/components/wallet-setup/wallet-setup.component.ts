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
import { WalletSetup } from '../../domains/csc-types';

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
  downloadedBytes = 0;
  totalBytes = 0;
  downloadPercentage: number;
  downloadVersion = '';
  downloadCompleted = false;
  initialWalletCreation = true;

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
    // check if we already have a wallet
    const availableWallets: Array<any> = this.localStorageService.get(AppConstants.KEY_AVAILABLE_WALLETS);
    if (availableWallets != null &&  availableWallets.length >= 1) {
      this.initialWalletCreation = false;
    }
    // generate recovery words
    this.walletService.walletSetup = {} as WalletSetup;
    this.walletService.walletSetup.recoveryMnemonicWords = CSCCrypto.getRandomMnemonic();
    // set network default to LIVE
    this.walletService.walletSetup.testNetwork = false;
    // generate wallet UUID
    this.walletService.walletSetup.walletUUID = UUID.UUID();
    // set backup location
    this.walletService.walletSetup.backupLocation = this.electron.remote.getGlobal('vars.backupLocation');
    this.logger.debug('### WalletSetup: ' + JSON.stringify(this.walletService.walletSetup));
  }

  onHideSetup() {
    if (this.initialWalletCreation) {
      this.logger.debug('### Setup -> Quit');
      // quit the wallet
      this.electron.remote.app.quit();
      // we have no wallet yet so send the wallet-closed event
      this.electron.ipcRenderer.send('wallet-closed', true);
    } else {
      // wallet creation canceled so return to login
      this.router.navigate(['login']);
    }
  }

  doRestartAndInstall() {
    // in case an update was downloaded we'll do a restart and install
    this.electron.ipcRenderer.send('autoupdate-restart', true);
  }
}
