import { Component, OnInit, ViewEncapsulation, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { ElectronService } from '../../providers/electron.service';
import { WalletService } from '../../providers/wallet.service';
import { DatePipe } from '@angular/common';
import { LocalStorageService } from 'ngx-store';
import { AppConstants } from '../../domains/app-constants';

const fs = require('fs');

@Component({
    selector: 'app-setup-step1',
    templateUrl: './step1-component.html',
    styleUrls: ['./wallet-setup.component.scss'],
    encapsulation: ViewEncapsulation.None
  })
  export class SetupStep1Component {

    constructor( private logger: LogService,
                 private router: Router,
                 private electron: ElectronService,
                 private walletService: WalletService,
                 private datePipe: DatePipe,
                 private localStorageService: LocalStorageService,
                 private _ngZone: NgZone ) { }

    create() {
      this.logger.debug('### Create new Wallet');
      // navigate to step 2
      this.router.navigate(['wallet-setup', 'setup-step2']);
    }

    restore() {
      this.logger.debug('### SETUP -> Recover Backup');
      this.electron.remote.dialog.showMessageBox({ message: 'Recover process will overwrite the current wallet. Are you sure?', buttons: ['OK', 'Cancel']}).then(result => {
        this.logger.debug('### Warning Result: ' + result);
        if (result.response === 0) {
          // execute recover process
          this._ngZone.run(() => {
            let restoreInProgress = true;
            this.electron.remote.dialog.showOpenDialog(
                { title: 'Wallet Backup Location',
                  defaultPath: this.electron.remote.getGlobal('vars').backupLocation,
                  properties: ['openFile']}).then(result => {
                  this.logger.debug('File Dialog Result: ' + JSON.stringify(result));
                  if (result && result.filePaths.length > 0) {
                      const backup = JSON.parse(fs.readFileSync(result[0]));
                      this.logger.debug('### localStorage: ' + JSON.stringify(backup.LocalStorage));
                      if (backup.LocalStorage.length > 0) {
                        // clear current local storage
                        this.localStorageService.clear('all');
                        let walletUUID = '';
                        let walletLocation = '';
                        // loop over local storage parameters and import them
                        backup.LocalStorage.forEach(keyItem => {
                          this.logger.debug('### LocalStorageKey: ' + JSON.stringify(keyItem));
                          this.localStorageService.set(keyItem.key, keyItem.value);
                          if (keyItem.key === 'availableWallets' && keyItem.value.length > 0) {
                            walletUUID = keyItem.value[0].walletUUID;
                          } else if (keyItem.key === 'walletLocation' && keyItem.value.length > 0) {
                            walletLocation = keyItem.value;
                          }
                        });
                        if (walletUUID.length > 0) {
                            // import DB
                            this.walletService.importWalletDump(backup.DB, walletLocation, walletUUID);
                            this.walletService.openWalletSubject.subscribe( openResult => {
                                if (openResult === AppConstants.KEY_LOADED && restoreInProgress === true) {
                                    this.electron.remote.dialog.showMessageBox({type: 'info', message: 'Restore from backup succesful', buttons: ['OK']});
                                    restoreInProgress = false;
                                }
                            });
                        } else {
                            if (restoreInProgress === true) {
                                restoreInProgress = false;
                                this.electron.remote.dialog.showMessageBox({type: 'error', message: 'Restore from backup could not be completed', buttons: ['OK']});
                            }
                        }
                        // redirect to login
                        this.router.navigate(['login']);
                      }
                  }
                }
            );
          });
        } else {
          this._ngZone.run(() => {
            this.router.navigate(['home']);
          });
        }
      });
    }

    recreate() {
      this.logger.debug('### Setup -> Recover With Mnemonic');
      this.electron.remote.dialog.showMessageBox({ message: 'Recover process will overwrite the current wallet. Are you sure?', buttons: ['OK', 'Cancel']}).then(result => {
        this.logger.debug('### Warning Result: ' + result);
        if (result.response === 0) {
          // execute recover process
          this._ngZone.run(() => {
            this.router.navigate(['recoverMnemonic']);
          });
        } else {
          this._ngZone.run(() => {
            this.router.navigate(['home']);
          });
        }
      });
    }
  }
