import { Component, OnInit, ViewEncapsulation, ViewChild, ElementRef, Renderer2, AfterViewInit, OnDestroy, NgZone } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { timer, Subscription } from 'rxjs';
import { WalletService } from '../../providers/wallet.service';
import { ElectronService } from '../../providers/electron.service';
import { LocalStorage, SessionStorage, LocalStorageService, SessionStorageService } from 'ngx-store';
import { SelectItem } from 'primeng/primeng';
import { CSCUtil } from '../../domains/csc-util';
import { AppConstants } from '../../domains/app-constants';
import { LogService } from '../../providers/log.service';
import { AppComponent } from '../../../app/app.component';
import { setTimeout } from 'timers';
import { CasinocoinService } from '../../providers/casinocoin.service';
import { WalletDefinition } from '../../domains/csc-types';
import { TranslateService } from '@ngx-translate/core';

const fs = require('fs');

@Component({
    moduleId: module.id,
    templateUrl: './login.component.html',
    styleUrls: ['./login.component.scss'],
    providers: [ DatePipe ]
})

export class LoginComponent implements OnInit, AfterViewInit, OnDestroy {

    // @ViewChild('inputPassword') inputPasswordElementRef: ElementRef;

    @SessionStorage() public currentWallet: string;

    selectedWallet: WalletDefinition;
    walletPassword: string;
    walletCreationDate: string;
    walletEmail: string;
    wallets: SelectItem[] = [];

    returnUrl: string;
    footer_visible = false;
    error_message: string;

    login_icon = 'pi pi-check';

    dialog_visible = true;
    timer: any;
    quitFromLogin = false;
    loginFinished = false;
    quitListener: Subscription;

    update_dialog_visible = false;
    autoUpdateRunning = false;
    downloadedBytes = 0;
    totalBytes = 0;
    downloadPercentage: number;
    downloadVersion = '';
    downloadCompleted = false;

    public availableWallets: Array<WalletDefinition>;

    constructor(
        private logger: LogService,
        private route: ActivatedRoute,
        private router: Router,
        private electron: ElectronService,
        private walletService: WalletService,
        private datePipe: DatePipe,
        private localStorageService: LocalStorageService,
        private sessionStorageService: SessionStorageService,
        private casinocoinService: CasinocoinService,
        private translate: TranslateService,
        public renderer: Renderer2,
        private _ngZone: NgZone,
        private decimalPipe: DecimalPipe
    ) { }

    ngOnInit() {
        this.logger.debug('### LoginComponent onInit');
        // get return url from route parameters or default to '/'
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
        // get available wallets (we switched to a single wallet for WLT wallet)
        this.availableWallets = this.localStorageService.get(AppConstants.KEY_AVAILABLE_WALLETS);
        if (this.availableWallets === null) {
            this.selectedWallet = { walletUUID: '', creationDate: -1, location: '', mnemonicHash: '', network: '', passwordHash: '', userEmail: ''};
            this.router.navigate(['/wallet-setup']);
        } else if (this.availableWallets.length === 1) {
            this.selectedWallet = this.availableWallets[0];
            const walletCreationDate = new Date(CSCUtil.casinocoinToUnixTimestamp(this.selectedWallet.creationDate));
            this.translate.get('PAGES.LOGIN.CREATED-ON').subscribe((res: string) => {
                this.walletCreationDate = res + ' ' + this.datePipe.transform(walletCreationDate, 'yyyy-MM-dd HH:mm:ss');
            });
            this.walletEmail = this.selectedWallet.userEmail;
        } else {
            this.logger.debug('### LOGIN Wallet Count: ' + this.availableWallets.length);
            for (let i = 0; i < this.availableWallets.length; i++) {
                this.logger.debug('### LOGIN Wallet: ' + JSON.stringify(this.availableWallets[i]));
                let walletLabel = this.availableWallets[i]['walletUUID'].substring(0, 12);
                const creationDate = new Date(CSCUtil.casinocoinToUnixTimestamp(this.availableWallets[i]['creationDate']));
                walletLabel = walletLabel + '... [Created: ' + this.datePipe.transform(creationDate, 'yyyy-MM-dd') + ']';
                if (this.availableWallets[i]['network']) {
                    walletLabel = walletLabel + ' ' + this.availableWallets[i]['network'];
                }
                this.logger.debug('### LOGIN Wallet Label: ' + walletLabel);
                this.wallets.push({label: walletLabel, value: this.availableWallets[i]['walletUUID']});
            }
            // const walletCreationDate = new Date(CSCUtil.casinocoinToUnixTimestamp(this.selectedWallet.creationDate));
            // this.translate.get('PAGES.LOGIN.CREATED-ON').subscribe((res: string) => {
            //     this.walletCreationDate = res + ' ' + this.datePipe.transform(walletCreationDate, 'yyyy-MM-dd HH:mm:ss');
            // });
        }
        // Listen for electron main events
        this.electron.ipcRenderer.on('action', (event, arg) => {
            this.logger.debug('### LOGIN Received Action: ' + arg);
            if (arg === 'quit-wallet' && (this.quitFromLogin || !this.loginFinished)) {
                this.quitListener = this.walletService.openWalletSubject.subscribe( status => {
                    this.logger.debug('### LOGIN Wallet: ' + status);
                    if (status === AppConstants.KEY_LOADED && (this.quitFromLogin || !this.loginFinished)) {
                        // we need to close the wallet
                        this.walletService.closeWallet();
                    } else if ((status === AppConstants.KEY_CLOSED || status === AppConstants.KEY_INIT) && (this.quitFromLogin || !this.loginFinished)) {
                        this.electron.ipcRenderer.send('wallet-closed', true);
                        this.dialog_visible = false;
                    }
                });
            }
        });
        this.electron.ipcRenderer.on('update-message', (event, arg) => {
            this.logger.info('### LOGIN Received Auto Update Message: ' + arg.event);
            if (arg.event === 'update-available') {
                this.logger.debug('### LOGIN Hide Dialog, Show Download');
                this._ngZone.run(() => {
                    this.autoUpdateRunning = true;
                    this.downloadVersion = arg.data.version;
                    this.downloadPercentage = 0;
                    this.dialog_visible = false;
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
                    this.autoUpdateRunning = false;
                    this.downloadCompleted = true;
                });
            } else if (arg.event === 'error') {
                this.logger.debug('### LOGIN AutoUpdate Error: ' + JSON.stringify(arg.data));
                this.autoUpdateRunning = false;
            }
        });
    }

    ngAfterViewInit(): void {
        this.logger.debug('### LoginComponent AfterViewInit');
        // somehow the initial focus only works with a timer waiting some msec
        // this.timer = setInterval(() => {
        //     this.logger.debug('### LoginComponent AfterViewInit Timer');
        //     try {
        //         const passwordElement: any = this.renderer.selectRootElement('#inputPassword');
        //         passwordElement.focus();
        //     } catch (error) {}
        //     clearInterval(this.timer);
        // }, 500);
    }

    ngOnDestroy(): void {
        this.logger.debug('### LoginComponent OnDestroy');
        if (this.quitListener !== undefined) {
            this.quitListener.unsubscribe();
        }
        this.electron.ipcRenderer.removeListener('action', this.handleActionEvent);
    }

    handleActionEvent(event, arg) {
        this.logger.debug('### LOGIN Received Action: ' + arg);
        if (arg === 'quit-wallet' && this.quitFromLogin) {
            this.quitListener = this.walletService.openWalletSubject.subscribe( status => {
                this.logger.debug('### LOGIN Wallet: ' + status);
                if (status === AppConstants.KEY_LOADED && this.quitFromLogin) {
                    // we need to close the wallet
                    this.walletService.closeWallet();
                } else if ((status === AppConstants.KEY_CLOSED || status === AppConstants.KEY_INIT) && this.quitFromLogin) {
                    this.electron.ipcRenderer.send('wallet-closed', true);
                    this.dialog_visible = false;
                }
            });
        }
    }

    doOpenWallet() {
        this.logger.debug('### doOpenWallet: ' + JSON.stringify(this.selectedWallet));
        if (this.walletPassword == null || this.walletPassword.length === 0) {
            this.footer_visible = true;
            this.error_message = 'Please enter the wallet password!';
            const passwordElement: any = this.renderer.selectRootElement('#inputPassword');
            passwordElement.focus();
        } else {
            this.login_icon = 'pi fa-spin pi-spinner';
            this.footer_visible = false;
            const finishTimer = timer(1000);
            finishTimer.subscribe(val => {
                this.logger.debug('### LoginComponent - Check Wallet Password ###');
                if (this.walletService.checkWalletPasswordHash(this.walletPassword, this.selectedWallet.walletUUID, this.selectedWallet.passwordHash)) {
                    this.logger.debug('### checkWalletHash: OK');
                    this.loginFinished = true;
                    // const walletIndex = this.availableWallets.findIndex( item => item['walletUUID'] === this.selectedWallet);
                    this.sessionStorageService.set(AppConstants.KEY_CURRENT_WALLET, this.selectedWallet);
                    this.sessionStorageService.set(AppConstants.KEY_WALLET_PASSWORD, this.walletPassword);
                    this.localStorageService.set(AppConstants.KEY_WALLET_LOCATION, this.selectedWallet.location);
                    if (this.selectedWallet.network === 'LIVE') {
                        this.localStorageService.set(AppConstants.KEY_PRODUCTION_NETWORK, true);
                    } else {
                        this.localStorageService.set(AppConstants.KEY_PRODUCTION_NETWORK, false);
                    }
                    this.localStorageService.set(AppConstants.KEY_WALLET_PASSWORD_HASH, this.selectedWallet.passwordHash);

                    this.walletService.openWallet(this.selectedWallet.walletUUID);
                    this.router.navigate(['home']);
                    this.footer_visible = false;
                    this.error_message = '';
                    this.login_icon = 'pi pi-check';
                } else {
                    // Invalid Wallet Password !!!
                    this.footer_visible = true;
                    this.error_message = 'You entered the wrong wallet password!';
                    this.login_icon = 'pi pi-check';
                    const passwordElement: any = this.renderer.selectRootElement('#inputPassword');
                    passwordElement.value = '';
                    passwordElement.focus();
                }
            });
        }
    }

    onHideLogin() {
        if (!this.autoUpdateRunning) {
            this.logger.debug('### Login -> Quit');
            this.quitFromLogin = true;
            this.electron.remote.app.quit();
        }
    }

    onRecoverBackup() {
        this.logger.debug('### LOGIN -> Recover Backup');
        let restoreInProgress = true;
        this.logger.debug('### Login -> Recover With Mnemonic');
        this.electron.remote.dialog.showMessageBox({ message: 'Recover process will overwrite the current wallet. Are you sure?', buttons: ['OK', 'Cancel']}, (result) => {
            this.logger.debug('### Warning Result: ' + result);
            if (result === 0) {
                // execute recover process
                this._ngZone.run(() => {
                    this.electron.remote.dialog.showOpenDialog(
                        { title: 'Wallet Backup Location',
                          defaultPath: this.electron.remote.getGlobal('vars').backupLocation,
                          properties: ['openFile']}, (result) => {
                          this.logger.debug('File Dialog Result: ' + JSON.stringify(result));
                          if (result && result.length > 0) {
                              const backup = JSON.parse(fs.readFileSync(result[0]));
                              this.logger.debug('### localStorage: ' + JSON.stringify(backup.LocalStorage));
                              if (backup.LocalStorage.length > 0) {
                                // clear current local storage
                                this.localStorageService.clear('all');
                                let walletUUID = '';
                                let walletLocation = '';
                                // loop over local storage parameters and import them
                                backup.LocalStorage.forEach(keyItem => {
                                    this.localStorageService.set(keyItem.key, keyItem.value);
                                    if (keyItem.key === 'availableWallets' && keyItem.value.length > 0) {
                                        walletUUID = keyItem.value[0].walletUUID;
                                    } else if (keyItem.key === 'walletLocation' && keyItem.value.length > 0) {
                                        walletLocation = keyItem.value;
                                    }
                                });
                                this.logger.debug('### LOGIN - Restore - walletUUID: ' + walletUUID + ' walletLocation: ' + walletLocation);
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
            }
        });
    }

    onRecoverMnemonic() {
        this.logger.debug('### Login -> Recover With Mnemonic');
        this.router.navigate(['recoverMnemonic']);
    }

    doRestartAndInstall() {
        // in case an update was downloaded we'll do a restart and install
        this.electron.ipcRenderer.send('autoupdate-restart', true);
    }

    onChangeSelectedWallet(event) {
        this.logger.debug('### onChangeSelectedWallet: ' + JSON.stringify(event));
        // get selected wallet
        this.selectedWallet = this.availableWallets.find( item => item.walletUUID === event.value);
        const walletCreationDate = new Date(CSCUtil.casinocoinToUnixTimestamp(this.selectedWallet.creationDate));
        this.translate.get('PAGES.LOGIN.CREATED-ON').subscribe((res: string) => {
            this.walletCreationDate = res + ' ' + this.datePipe.transform(walletCreationDate, 'yyyy-MM-dd HH:mm:ss');
        });
        this.walletEmail = this.selectedWallet.userEmail;
    }
}
