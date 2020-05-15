import { languages } from './../../../assets/languages';
import { Component, OnInit, OnDestroy, NgZone, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { ElectronService } from '../../providers/electron.service';
import { LogService } from '../../providers/log.service';
import { WalletService } from '../../providers/wallet.service';
import { CasinocoinService } from '../../providers/casinocoin.service';
import { MarketService } from '../../providers/market.service';
import { WalletSettings, WalletDefinition, LedgerStreamMessages } from '../../domains/csc-types';
import { LocalStorageService, SessionStorageService } from 'ngx-store';
import { AppConstants } from '../../domains/app-constants';
import { CSCUtil } from '../../domains/csc-util';
import { Menu as ElectronMenu, MenuItem as ElectronMenuItem } from 'electron';
import { MatListModule, MatSidenavModule } from '@angular/material';
import { LokiKey, LokiTransaction, LokiTxStatus, LokiAccount } from '../../domains/lokijs';
import * as LokiTypes from '../../domains/lokijs';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { CasinocoinAPI } from '@casinocoin/libjs';
import { SelectItem, Message, MenuItem as PrimeMenuItem, ConfirmationService } from 'primeng/api';
import { GetServerInfoResponse } from '@casinocoin/libjs/common/serverinfo';
import { TranslateService } from '@ngx-translate/core';
import Big from 'big.js';
import { CSCCrypto } from '../../domains/csc-crypto';
import { DatePipe, CurrencyPipe } from '@angular/common';
import { Dropdown } from 'primeng/dropdown';
import { NotificationService } from '../../providers/notification.service';
import { generateSeed, deriveKeypair, deriveAddress } from 'casinocoin-libjs-keypairs';
const path = require('path');
const fs = require('fs');

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
  providers: [ConfirmationService
  ]
})
export class HomeComponent implements OnInit, OnDestroy {

  @ViewChild('accountDropdown') accountDropdown: Dropdown;

  public cscAPI: CasinocoinAPI;
  public walletSettings: WalletSettings = { showNotifications: true, fiatCurrency: 'USD' };
  public fiatCurrencies: SelectItem[] = [];
  public selectedFiatCurrency: string;
  public currentWalletObject: WalletDefinition;
  public active_menu_item: string;
  public balance: string;
  public fiat_balance: string;
  public connected_tooltip: string;

  public show_menu = 'small';
  public menu_items: PrimeMenuItem[];
  public tools_context_menu: ElectronMenu;
  public connection_context_menu: ElectronMenu;

  public applicationVersion: string;
  public serverVersion: string;
  public network: string;

  public showPrivateKeyImportDialog = false;
  public showSettingsDialog = false;
  public showServerInfoDialog = false;
  public showPasswordDialog = false;
  public showPasswordCallback: any;

  public privateKeySeed = '';
  public walletPassword = '';
  public importFileObject: Object;

  public privateKeyExportLocation: string;
  public privateKeyImportfile: string;
  public importKeys: Array<LokiKey> = [];

   // Growl messages
  public msgs: Message[] = [];

  public isConnected = new BehaviorSubject<boolean>(false);
  public connected_icon = 'fa fa-wifi fa-2x';
  public connectionColorClass = 'connected-color';
  public connectionImage = 'assets/icons/connected.png';
  public active_icon = 'fa fa-check';
  public manualDisconnect = false;
  public searchDate: Date;
  public display = false;
  public refreshWallet = false;


  public serverState: any;
  public currentServer: GetServerInfoResponse;
  public currentLedger: LedgerStreamMessages;
  public casinocoinConnectionSubject: Observable<any>;
  public uiChangeSubject = new BehaviorSubject<string>(AppConstants.KEY_INIT);

  public walletBalance: string;
  public transaction_count: number;
  public last_transaction: number;

  public footer_visible = false;
  public error_message: string;
  public footer_message: string;
  public passwordDialogHeader = 'CasinoCoin Wallet Password';

  public backupPath: string;

  public showSignMessageDialog = false;
  public showVerifyMessageDialog = false;
  public accounts: SelectItem[] = [];
  public selectedAccount: string;
  public msgToSign: string;
  public signPubKey: string;
  public signSignature: string;
  public msgToVerify: string;
  public verifyPubKey: string;
  public verifySignature: string;
  public verificationFinished = false;
  public verificationResult = false;

  public copy_context_menu: ElectronMenu;
  public copiedValue: string;
  public walletCloseReceived = false;
  public showImportKeyDialog = false;
  public importAccountSecret: string;
  public importRequiredTotalReserve: any;
  public importSecretChoice = 'existing';
  public errorPass = false;
  public subscriptionWatchItem: Subscription;
  public checked = false;
  public showSuccessImport = false;


  public selectLanguage: any;
  public languages: Array<{name, value}>;
  public languageSystem: {name, value};

  public confirmImportKey = false;

  constructor( private logger: LogService,
               private electron: ElectronService,
               private walletService: WalletService,
               private casinocoinService: CasinocoinService,
               private marketService: MarketService,
               private localStorageService: LocalStorageService,
               private sessionStorageService: SessionStorageService,
               private notificationService: NotificationService,
               private translate: TranslateService,
               private router: Router,
               private datePipe: DatePipe,
               private _ngZone: NgZone,
               private currencyPipe: CurrencyPipe,
               private confirmationService: ConfirmationService ) {
    this.languages = languages;
    this.logger.debug('### INIT Home');
    this.applicationVersion = this.electron.remote.app.getVersion();
    this.network = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).network;
  }

  ngOnInit() {
    // console.log(this.walletService.getAllAccounts());
    // get the backup path
    this.backupPath = this.electron.remote.getGlobal('vars').backupLocation;
    this.logger.debug('### HOME Backup Location: ' + this.backupPath);
    // get the complete wallet object
    this.currentWalletObject = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    this.logger.info('### HOME currentWallet: ' + JSON.stringify(this.currentWalletObject));
    // check if wallet is open else open it
    this.walletService.openWalletSubject.subscribe( result => {
      if (result === AppConstants.KEY_INIT) {
        this.logger.debug('### HOME Wallet INIT');
        // wallet not opened yet so open it
        this.walletService.openWallet(this.currentWalletObject.walletUUID);
      } else if (result === AppConstants.KEY_OPENING) {
        this.logger.debug('### HOME Wallet OPENING');
      } else if (result === AppConstants.KEY_LOADED) {
        this.logger.debug('### HOME Wallet LOADED');
        this.doBalanceUpdate();
        this.listenForMainEvents();
        // this.removingImportAccount();
        // load the account list
        this.walletService.getAllAccounts().forEach( element => {
          if (element.currency === 'CSC') {
            const accountLabel = element.label + ' - ' + element.accountID;
            this.accounts.push({label: accountLabel, value: element.accountID});
          }
        });
      }  else if (result === AppConstants.KEY_CLOSED) {
        this.logger.debug('### HOME Wallet CLOSED');
        this.electron.ipcRenderer.send('wallet-closed', true);
      }
    });

    this.casinocoinService.connect().subscribe( result => {
      if (result === AppConstants.KEY_CONNECTED) {
        this.serverVersion = this.casinocoinService.serverInfo.buildVersion;
        this.setWalletUIConnected();
        this.casinocoinService.accountSubject.subscribe( account => {
          // one of the accounts got updated so update the balance
          this.doBalanceUpdate();
        });
        // refresh available token list
        this.casinocoinService.refreshAvailableTokenList();
      } else {
        // we are not connected or disconnected
        this.setWalletUIDisconnected();
      }
    });

    this.translate.stream('PAGES.ELECTRON.CON-NET').subscribe((translated: string) => {
      const connect_context_menu_template = [
        { label: this.translate.instant('PAGES.ELECTRON.CON-NET'),
          click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('connect-context-menu-event', 'connect'); }, visible: true
          },
          { label: this.translate.instant('PAGES.ELECTRON.DIS-NET'),
            click(menuItem, browserWindow, event) {
                browserWindow.webContents.send('connect-context-menu-event', 'disconnect'); }, visible: false
          },
          { label: this.translate.instant('PAGES.ELECTRON.SER-INF'),
            click(menuItem, browserWindow, event) {
                browserWindow.webContents.send('connect-context-menu-event', 'server-info'); }, visible: false
          }
        ];
      this.connection_context_menu = this.electron.remote.Menu.buildFromTemplate(connect_context_menu_template);
      // define Tools context menu
      const tools_context_menu_template = [
        { label: this.translate.instant('PAGES.ELECTRON.CRE-WLLT'), click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'create-new-wallet');
          }
        },
        { label: this.translate.instant('PAGES.ELECTRON.REFSH-WLLT'), click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'refresh-wallet');
          }
        },
        { label: this.translate.instant('PAGES.ELECTRON.CHNG-WLLT'), click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'close-wallet');
          }
        },
        { label: this.translate.instant('PAGES.ELECTRON.GNT-WLLT'),
          click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'paper-wallet');
          }, enabled: true
        },
        { label: this.translate.instant('PAGES.ELECTRON.IMP-KEY'),
          click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'import-priv-key');
          }
        }
      ];

      this.tools_context_menu = this.electron.remote.Menu.buildFromTemplate(tools_context_menu_template);
      // message signing submenu
      const messageSigningMenu = { label: this.translate.instant('PAGES.ELECTRON.MSG-SIGN') , submenu: [
          { label: this.translate.instant('PAGES.ELECTRON.SIGN-MSG'),
            click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('context-menu-event', 'sign-message');
            }, enabled: true
          },
          { label: this.translate.instant('PAGES.ELECTRON.VER-MSG'),
            click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('context-menu-event', 'verify-message');
            }, enabled: true
          }
      ]};

      this.tools_context_menu.append(new this.electron.remote.MenuItem(messageSigningMenu));
      // define Copy context menu
      const copy_context_menu_template = [
        { label: this.translate.instant('PAGES.ELECTRON.COPY'),
          click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('copy-context-menu-event', 'copy');
          }
        }
      ];
      this.copy_context_menu = this.electron.remote.Menu.buildFromTemplate(copy_context_menu_template);
      // listen to connect context menu events
      this.electron.ipcRenderer.on('connect-context-menu-event', (event, arg) => {
        this.logger.debug('### connect-context-menu-event: ' + arg);
        this._ngZone.run(() => {
          if (arg === 'connect') {
            this.onConnect();
          } else if (arg === 'disconnect') {
            this.onDisconnect();
          } else if (arg === 'server-info') {
            this.onServerInfo();
          }
        });
      });
      // listen to tools context menu events
      this.electron.ipcRenderer.on('context-menu-event', (event, arg) => {
        this.logger.debug('### HOME Menu Event: ' + arg);
        this._ngZone.run(() => {
          if (arg === 'import-priv-key') {
            this.onPrivateKeyImport();
          } else if (arg === 'create-new-wallet') {
            this.onCreatNewWallet();
          } else if (arg === 'refresh-wallet') {
            this.showDialog();
          } else if (arg === 'close-wallet') {
            this.onCloseWallet();
          } else if (arg === 'paper-wallet') {
            this.onPaperWallet();
          } else if (arg === 'sign-message') {
            this.onShowSignMessage();
          } else if (arg === 'verify-message') {
            this.onShowVerifyMessage();
          } else {
            this.logger.debug('### Context menu not implemented: ' + arg);
          }
        });
      });
      // listen to copy context menu events
      this.electron.ipcRenderer.on('copy-context-menu-event', (event, arg) => {
        this._ngZone.run(() => {
          if (arg === 'copy') {
            this.copyValueToClipboard();
          }
        });
      });
      this.electron.ipcRenderer.on('update-message', (event, arg) => {
        this.logger.info('### HOME Received Auto Update Message: ' + arg);
      });
      // load wallet settings
      this.walletSettings = this.localStorageService.get(AppConstants.KEY_WALLET_SETTINGS);
      if (this.walletSettings == null) {
        // settings do not exist yet so create
        this.walletSettings = {fiatCurrency: 'USD', showNotifications: false};
        this.localStorageService.set(AppConstants.KEY_WALLET_SETTINGS, this.walletSettings);
      }
      // load fiat currencies and update market value
      this.fiatCurrencies = this.marketService.getFiatCurrencies();
      this.updateMarketService(this.walletSettings.fiatCurrency);

      this.subscriptionWatchItem = this.casinocoinService.eventSubject.subscribe( value => {
        if (value === 'hiddenRefreshing') {
          this.router.navigate(['home/tokenlist']);
          this.refreshWallet = false;
        }
        if (value === 'showDialog') {
          this.refreshWallet = true;
          this.display = false;
        }
      });
    });
    this.getSystemLanguage();
  }

  removeUndefined(obj: Object): Object {
    // return _.omit(obj, _.isUndefined)
    Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
    return obj;
  }

  confirm() {
    if ( this.walletPassword.trim() === '' ||
         this.importAccountSecret.trim() === '' ||
         this.casinocoinService.isValidSecret(this.importAccountSecret.trim()) === false) {
      this.footer_message = 'Empty password or invalid account secret';
      this.active_icon = 'fa fa-check';
      this.footer_visible = true;
      this.importAccountSecret = '';
      this.walletPassword = '';
      this.checked = false;
      return setTimeout(() => {
        this.footer_message = null;
      }, 3000);
    }
    if (this.checked) {
      this.confirmationService.confirm({
          message: 'Are you sure that you want to proceed?',
          header: 'Confirmation',
          icon: 'pi pi-exclamation-triangle',
        accept: () => {
          this.importOnlyNotMovingFunds();
        },
        reject: () => {
          this.active_icon = 'fa fa-check';
          this.footer_visible = false;
          this.importAccountSecret = '';
          this.walletPassword = '';
          this.footer_message = '' ;
          this.checked = false;
          return setTimeout(() => {
            this.footer_message = null;
          }, 3000);
        }
      });
    }
  }

  getSystemLanguage() {
    const ln = this.translate.getDefaultLang();
    this.languageSystem = this.languages.find(item => item.value === ln);
    if (!this.languageSystem) { this.languageSystem = {name: 'English', value: 'en'}; }
  }

  ngOnDestroy() {
    this.logger.debug('### HOME OnDestroy');
    this.electron.ipcRenderer.removeAllListeners('context-menu-event');
    this.electron.ipcRenderer.removeAllListeners('action');
  }

  changeLanguage(language: {name , value}) {
    try {
      this.translate.use(language.value);
    } catch (error) {
      console.log(error.statusText);
    }
  }

  async onRefresh(password) {
    try {
      await this.casinocoinService.regenerateAccounts(password);
    } catch (error) {
      this.errorPass = true;
      setTimeout(() => {
        this.errorPass = false;
      }, 3000);
    }
  }

  showDialog() {
    this.errorPass = false;
    this.display = true;
  }


  listenForMainEvents() {
    // Listen for electron main events
    this.electron.ipcRenderer.on('action', (event, arg) => {
      this.logger.info('### HOME Received Action: ' + arg);
      this._ngZone.run(() => {
        if (arg === 'save-wallet') {
          this.logger.debug('### HOME Logout Wallet on Suspend ###');
          this.closeWallet();
        } else if (arg === 'quit-wallet') {
          this.logger.info('### HOME Save Wallet on Quit ###');
          // backup the wallet
          this.backupWallet();
          // close and logout
          // the closeWallet emits KEY_CLOSED on openWalletSubject
          // this class picks that up and emits wallet-closed to the electron main process
          this.walletService.closeWallet();
        } else if (arg === 'refresh-balance') {
          this.logger.debug('### HOME Refresh Balance Received ###');
          this.doBalanceUpdate();
        }
      });
    });
  }

  onWallet() {
    this.active_menu_item = 'wallet';
    // navigate to wallet
    this.router.navigate(['home', 'tokenlist']);
  }

  onHistory() {
    this.active_menu_item = 'history';
    // navigate to transaction history
    this.router.navigate(['home', 'history']);
  }

  onExchanges() {
    this.active_menu_item = 'exchanges';
    // navigate to exchange information
    this.router.navigate(['home', 'exchanges']);
  }

  onReceiveCoins() {
    this.logger.debug('### HOME Receive Coins Clicked !!');
    this.active_menu_item = 'receive';
    // navigate to receive
    this.router.navigate(['home', 'receive']);
  }

  onAddressbook() {
    this.logger.debug('### HOME Addressbook Clicked !!');
    this.active_menu_item = 'addressbook';
    // navigate to addressbook
    this.router.navigate(['home', 'addressbook']);
  }

  onRefreshWallet() {
    this.logger.debug('### HOME Refreshwallet Clicked !!');
    this.active_menu_item = '';
    // navigate to refresh wallet
    this.router.navigate(['home', 'transactions', {refreshWallet: true}]);
  }

  changePassword() {
    this.logger.debug('### HOME Change Password Clicked !!');
    this.active_menu_item = '';
    this.router.navigate(['home', 'changepassword']);
  }

  onSupport() {
    this.logger.debug('### HOME Support Clicked !!');
    this.active_menu_item = 'support';
    // navigate to support
    this.router.navigate(['home', 'support']);
  }

  onSettingsSave() {
    // save the settings to localstorage
    this.localStorageService.set(AppConstants.KEY_WALLET_SETTINGS, this.walletSettings);
    // update the balance to reflect the last changes
    this.doBalanceUpdate();
    this.showSettingsDialog = false;
  }

  onMenuClick() {
    this.logger.debug('Menu Clicked !!');
    this.show_menu = this.show_menu === 'small' ? 'wide' : 'small';
  }

  onSettingsMenuClick(event) {
    this.showSettingsDialog = true;
  }

  onToolsMenuClick(event) {
    this.tools_context_menu.popup({window: this.electron.remote.getCurrentWindow()});
  }

  onConnectionClick(event) {
    this.connection_context_menu.popup({window: this.electron.remote.getCurrentWindow()});
  }

  selectedMenuItem(item) {
    item.command();
  }

  onConnect() {
    this.logger.debug('### HOME Connect ###');
    this.manualDisconnect = false;
    this.casinocoinService.connect();
    // this.connectToCasinocoinNetwork();
  }

  onDisconnect() {
    this.logger.debug('### HOME Disconnect ###');
    this.manualDisconnect = true;
    this.casinocoinService.disconnect();
  }

  onServerInfo() {
    this.logger.debug('### HOME onServerInfo: ' + JSON.stringify(this.casinocoinService.serverInfo));
    this.currentServer = this.casinocoinService.serverInfo;
    if (this.casinocoinService.ledgers.length > 0) {
     this.currentLedger = this.casinocoinService.ledgers[0];
     this.logger.debug('### HOME onServerInfo: ' + JSON.stringify(this.casinocoinService.ledgers[0]));
    }
    this.showServerInfoDialog = true;
  }

  onExit() {
    this.logger.debug('### HOME Exit Clicked !!');
    this.electron.remote.app.quit();
    // close the Database!
    // this.walletService.closeWallet();
    // this.walletService.openWalletSubject.subscribe( status => {
    //   if (status === AppConstants.KEY_CLOSED) {
    //     this.logger.info('### HOME - Wallet Saved - Exit Application !!');
    //     this.electron.remote.app.quit();
    //   }
    // });
  }

  closeWallet() {
    this.walletService.closeWallet();
    this.casinocoinService.disconnect();
    this.sessionStorageService.remove(AppConstants.KEY_CURRENT_WALLET);
    this.router.navigate(['login']);
  }

  executePasswordCallback() {
    this.showPasswordCallback();
  }

  doBalanceUpdate() {
    this.walletBalance = this.walletService.getWalletBalance('CSC') || '0';
    this.logger.debug('### HOME - Wallet Balance: ' + this.walletBalance);
    this.balance = CSCUtil.dropsToCsc(this.walletBalance);
    const balanceCSC = new Big(this.balance);
    if (this.marketService.coinMarketInfo != null && this.marketService.coinMarketInfo.price_fiat !== undefined) {
      this.logger.debug('### CSC Price: ' + this.marketService.cscPrice + ' BTC: ' + this.marketService.btcPrice + ' Fiat: ' + this.marketService.coinMarketInfo.price_fiat);
      const fiatValue = balanceCSC.times(new Big(this.marketService.coinMarketInfo.price_fiat)).toString();
      this.fiat_balance = this.currencyPipe.transform(fiatValue, this.marketService.coinMarketInfo.selected_fiat, 'symbol', '1.2-2');
    }
  }

  updateMarketService(event) {
    if (this.walletSettings.fiatCurrency !== undefined) {
        this.marketService.changeCurrency(this.walletSettings.fiatCurrency);
    }
  }

  updateShowNotification(event) {
    this.walletSettings.showNotifications = event;
    this.localStorageService.set(AppConstants.KEY_WALLET_SETTINGS, this.walletSettings);
  }

  setWalletUIConnected() {
    this.logger.debug('### HOME Set GUI Connected ###');
    this.connectionImage = 'assets/icons/connected.png';
    this.connectionColorClass = 'connected-color';
    this.translate.get('PAGES.HOME.CONNECTED').subscribe((res: string) => {
      this.connected_tooltip = res;
    });
    this.setConnectedMenuItem(true);
    this.currentServer = this.casinocoinService.serverInfo;
  }

  setWalletUIDisconnected() {
      this.logger.debug('### HOME Set GUI Disconnected ###');
      this.connectionImage = 'assets/icons/connected-red.png';
      this.connectionColorClass = 'disconnected-color';
      this.translate.get('PAGES.HOME.DISCONNECTED').subscribe((res: string) => {
        this.connected_tooltip = res;
      });
      this.setConnectedMenuItem(false);
  }

  setConnectedMenuItem(connected: boolean) {
    if (this.connection_context_menu !== undefined) {
      if (connected) {
        // enable disconnect
        this.connection_context_menu.items[0].visible = false;
        this.connection_context_menu.items[1].visible = true;
        this.connection_context_menu.items[2].visible = true;
      } else {
        // enable connect
        this.connection_context_menu.items[0].visible = true;
        this.connection_context_menu.items[1].visible = false;
        this.connection_context_menu.items[2].visible = false;
      }
    }
  }

  onPrivateKeyImport() {
    this.logger.debug('### HOME - Private Key Import Clicked !!');
    // show import dialog
    this.showImportKeyDialog = true;
    this.importAccountSecret = '';
    this.active_icon = 'fa fa-check';
    this.footer_message = '';
    this.footer_visible = false;
  }

  onCreatNewWallet() {
    this.logger.debug('### HOME - Create New Wallet Clicked !!');
    this.walletService.closeWallet();
    this.casinocoinService.disconnect();
    this.sessionStorageService.remove(AppConstants.KEY_CURRENT_WALLET);
    this.router.navigate(['wallet-setup', 'setup-step2']);
  }

  onCloseWallet() {
    this.walletService.closeWallet();
    this.casinocoinService.disconnect();
    this.sessionStorageService.remove(AppConstants.KEY_CURRENT_WALLET);
    this.router.navigate(['login']);
    this.logger.debug('### HOME - Change Wallet Clicked !!');
  }

  onPaperWallet() {
    this.logger.debug('### HOME - Paperwallet Clicked !!');
    // navigate to paperwallet
    this.router.navigate(['home', 'paperwallet']);
  }

  onImportPaperWallet() {
    this.logger.debug('### HOME - ImportPaperwallet Clicked !!');
    // navigate to paperwallet
    this.router.navigate(['home', 'importpaperwallet']);
  }

  onShowSignMessage() {
    this.logger.debug('### HOME Sign Message ###');
    this.resetSigning();
    this.showSignMessageDialog = true;
  }

  onShowVerifyMessage() {
    this.logger.debug('### HOME Verify Message ###');
    this.resetVerification();
    this.showVerifyMessageDialog = true;
  }

  signMessage() {
    this.logger.debug('### Sign With Account: ' + this.selectedAccount);
    if (!this.walletService.checkWalletPasswordHash(this.walletPassword)) {
      this.notificationService.addMessage({title: 'Message Signing', body: 'Invalid password. Message can not be signed'});
    } else {
      const key: LokiKey = this.walletService.getKey(this.selectedAccount);
      const secret = this.walletService.getDecryptSecret(this.walletPassword, this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail, key);
      const signResult = this.casinocoinService.cscAPI.signMessage(this.msgToSign, secret);
      this.logger.debug('### HOME Sign Result: ' + JSON.stringify(signResult));
      this.signPubKey = signResult['public_key'];
      this.signSignature = signResult['signature'];
    }
  }

  resetSigning() {
    this.accountDropdown.resetFilter();
    this.selectedAccount = null;
    this.msgToSign = '';
    this.walletPassword = '';
    this.signPubKey = '';
    this.signSignature = '';
  }

  resetVerification() {
    this.msgToVerify = '';
    this.verifyPubKey = '';
    this.verifySignature = '';
    this.verificationFinished = false;
    this.verificationResult = false;
  }

  verifyMessage() {
    if (this.msgToVerify.length === 0 || this.verifyPubKey.length < 32 || this.verifySignature.length < 128) {
      this.notificationService.addMessage({title: 'Message Verification', body: 'Invalid parameters for message signature verification.'});
      this.verificationFinished = false;
    } else {
      this.verificationResult = this.casinocoinService.cscAPI.verifyMessage(this.msgToVerify, this.verifySignature, this.verifyPubKey);
      this.verificationFinished = true;
      this.logger.debug('### HOME Verify Result: ' + this.verificationResult);
    }
  }

  removingImportAccount(account: string) {
    this.walletService.deleteAccount(account);
    this.walletService.removeKey(account);
    this.walletService.deleteTransactions(account);
  }

  importOnlyNotMovingFunds() {
      this.importAccountSecret = this.importAccountSecret.trim();
      this.active_icon = 'pi fa-spin pi-spinner';

      // check password
      const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
      if (this.walletService.checkWalletPasswordHash(this.walletPassword, walletObject.walletUUID, walletObject.passwordHash)) {

        // check the destination account id
        if (this.casinocoinService.cscAPI.isValidSecret(this.importAccountSecret.trim())) {

          // determine account from secret
          const importKeyPair = this.casinocoinService.cscAPI.deriveKeypair(this.importAccountSecret);
          const accountID = this.casinocoinService.cscAPI.deriveAddress(importKeyPair.publicKey);
          const findAccount = this.walletService.getAccount('CSC', accountID);
          if (findAccount) {
            this.footer_message = 'The account you want to import is already in this wallet';
            this.active_icon = 'fa fa-check';
            this.footer_visible = true;
            this.importAccountSecret = '';
            this.walletPassword = '';
            setTimeout(() => {
              this.footer_message = null;
            }, 5000);
            return;
          }
          console.log('accountID', accountID);

          const userEmail = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail;
          const secretsCSCCrypto = new CSCCrypto(this.walletPassword, userEmail);

          // get fees, account reserve
          const fees = this.casinocoinService.serverInfo.validatedLedger.baseFeeCSC;
          const accountReserve = this.casinocoinService.serverInfo.validatedLedger.reserveBaseCSC;
          const ownerReserve = Number(this.casinocoinService.serverInfo.validatedLedger.reserveIncrementCSC);

          // get main account to import
          const mainAccount: LokiTypes.LokiAccount = this.walletService.getMainAccount();
          const mainAccountKey: LokiKey = this.walletService.getKey(mainAccount.accountID);
          const mainAccountDecryptedSecret = secretsCSCCrypto.decrypt(mainAccountKey.secret);

          // get account balances to import
          this.casinocoinService.cscAPI.getBalances(accountID).then(balances => {
            this.logger.debug('### HOME balances: ' + JSON.stringify(balances));
            const requiredOwnerReserve = ownerReserve * balances.length;
            const requiredFees = Number(fees) * balances.length * 2;
            this.importRequiredTotalReserve = new Big(CSCUtil.cscToDrops(accountReserve)).plus(new Big(CSCUtil.cscToDrops(requiredFees.toString()))).plus(new Big(CSCUtil.cscToDrops(requiredOwnerReserve.toString())));
            const cscBalance = balances.find(item => item.currency === 'CSC');
            const importCSCValue = new Big(CSCUtil.cscToDrops(cscBalance.value)).minus(this.importRequiredTotalReserve);
            // this.logger.debug('### HOME requiredTotalReserve: ' + this.importRequiredTotalReserve);

            // derive keypair
            const keypair: any = deriveKeypair(this.importAccountSecret);
            const newKeyPair: LokiKey = { secret: this.importAccountSecret, publicKey: keypair.publicKey, privateKey: keypair.privateKey, accountID: deriveAddress(keypair.publicKey), encrypted: false };
            // save key to wallet
            this.walletService.addKey(newKeyPair);
            console.log('newKeyPair', newKeyPair);

            // encrypt wallet keys
            this.walletService.encryptAllKeys(this.walletPassword, this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail).subscribe(async result => {
              if (result === AppConstants.KEY_FINISHED) {
                if (importCSCValue > 0) {
                  for await (const balance of balances) {
                    const accountInfo = await this.casinocoinService.getAccountInfo(accountID);
                    if (accountInfo) {
                      if (balance.currency === 'CSC') {
                        const tokenAccount: LokiAccount = {
                          pk: ('CSC' + accountID),
                          accountID: accountID,
                          balance: balance.value,
                          accountSequence: -1,
                          currency: 'CSC',
                          tokenBalance: '0',
                          lastSequence: accountInfo.sequence,
                          label: 'CasinoCoin',
                          activated: true,
                          ownerCount: accountInfo.ownerCount,
                          lastTxID: accountInfo.previousAffectingTransactionID,
                          lastTxLedger: accountInfo.previousAffectingTransactionLedgerVersion
                        };
                        console.log('tokenAccount', tokenAccount);
                        // save account to wallet
                        this.walletService.addAccount(tokenAccount);
                        // subcribe to all accounts again
                        this.casinocoinService.subscribeAccountEvents();
                        // Refresh TokenList in the wallet
                        this.casinocoinService.updateAccountInfo(tokenAccount.currency, tokenAccount.accountID);
                      } else {
                        const tokenInfo = this.casinocoinService.getTokenInfo(balance.currency);
                        const tokenAccount: LokiAccount = {
                          pk: (tokenInfo.Token + accountID),
                          accountID: accountID,
                          balance: balance.value,
                          accountSequence: -1,
                          currency: tokenInfo.Token,
                          tokenBalance: '0',
                          lastSequence: accountInfo.sequence,
                          label: tokenInfo.FullName,
                          activated: true,
                          ownerCount: accountInfo.ownerCount,
                          lastTxID: accountInfo.previousAffectingTransactionID,
                          lastTxLedger: accountInfo.previousAffectingTransactionLedgerVersion
                        };
                        console.log('tokenAccount', tokenAccount);
                        // Refresh TokenList in the wallet
                        this.casinocoinService.updateAccountInfo(tokenAccount.currency, tokenAccount.accountID);
                        // subcribe to all accounts again
                        this.casinocoinService.subscribeAccountEvents();
                        // save account to wallet
                        this.walletService.addAccount(tokenAccount);
                      }
                    }
                  }
                  // Subject to update Token list
                  this.walletService.importsAccountSubject.next();
                  // get and add all account transactions
                  this.casinocoinService.cscAPI.getTransactions(accountID, { earliestFirst: true }).then(txResult => {
                    console.log('txResult', txResult);
                    txResult.forEach(tx => {
                      if (tx.type === 'payment' && tx.outcome.result === 'tesSUCCESS') {
                        let txDirection: string;
                        let txAccountID: string;
                        if (this.walletService.isAccountMine(tx.specification['destination'].address)) {
                          txDirection = AppConstants.KEY_WALLET_TX_IN;
                          txAccountID = tx.specification['destination'].address;
                          if (this.walletService.isAccountMine(tx.specification['source'].address)) {
                            txDirection = AppConstants.KEY_WALLET_TX_BOTH;
                            txAccountID = tx.specification['source'].address;
                          }
                        } else if (this.walletService.isAccountMine(tx.specification['source'].address)) {
                          txDirection = AppConstants.KEY_WALLET_TX_OUT;
                          txAccountID = tx.specification['source'].address;
                        }
                        // create new transaction object
                        const dbTX: LokiTransaction = {
                          accountID: tx.address,
                          amount: CSCUtil.cscToDrops(tx.outcome['deliveredAmount'].value),
                          currency: tx.outcome['deliveredAmount'].currency,
                          destination: tx.specification['destination'].address,
                          fee: CSCUtil.cscToDrops(tx.outcome.fee),
                          flags: 0,
                          lastLedgerSequence: tx.outcome.ledgerVersion,
                          sequence: tx.sequence,
                          signingPubKey: '',
                          timestamp: CSCUtil.iso8601ToCasinocoinTime(tx.outcome.timestamp),
                          transactionType: tx.type,
                          txID: tx.id,
                          txnSignature: '',
                          direction: txDirection,
                          validated: (tx.outcome.indexInLedger >= 0),
                          status: LokiTxStatus.validated,
                          inLedger: tx.outcome.ledgerVersion
                        };
                        // add Memos if defined
                        if (tx.specification['memos']) {
                          dbTX.memos = [];
                          tx.specification['memos'].forEach(memo => {
                            const newMemo = {
                              memo:
                                this.removeUndefined({
                                  memoType: memo.type,
                                  memoFormat: memo.format,
                                  memoData: memo.data
                                })
                            };
                            dbTX.memos.push(newMemo);
                          });
                        }
                        // add Destination Tag if defined
                        if (tx.specification['destination'].tag) {
                          dbTX.destinationTag = tx.specification['destination'].tag;
                        }
                        // add Invoice ID if defined
                        if (tx.specification['invoiceID'] && tx.specification['invoiceID'].length > 0) {
                          dbTX.invoiceID = tx.specification['invoiceID'];
                        }
                        // insert into the wallet
                        this.walletService.addTransaction(dbTX);
                      }
                    });
                  });
                  this.active_icon = 'fa fa-check';
                  this.showImportKeyDialog = false;
                  this.showSuccessImport = true;
                  this.importAccountSecret = '';
                  this.walletPassword = '';
                  this.footer_message = '';
                  this.footer_visible = false;
                  this.checked = false;
                  setTimeout(() => {
                    this.showSuccessImport = false;
                  }, 2500);
                } else {
                  this.footer_message = 'Not enough CSC in the source account to handle all required transactions.';
                  this.active_icon = 'fa fa-check';
                  this.footer_visible = true;
                  this.importAccountSecret = '';
                  this.walletPassword = '';
                }

                this.logger.debug('### WalletSetup - Key Encryption Complete');
                // save the wallet
                this.walletService.saveWallet();
              }
            });
          }).catch((err) => {
            this.logger.debug('### Import Account Page ::: found error on balances request :');
            console.log(err);
            this.logger.debug('### Import Account Page ::: no balances found, adding account :' + accountID);
            const tokenAccount: LokiAccount = {
              pk: ('CSC' + accountID),
              accountID: accountID,
              balance: '0',
              accountSequence: -1,
              currency: 'CSC',
              tokenBalance: '0',
              lastSequence: 0,
              label: 'CSC Account',
              activated: false,
              ownerCount: 0,
              lastTxID: '',
              lastTxLedger: 0
            };
            console.log('tokenAccount', tokenAccount);
            // subcribe to all accounts again
            this.casinocoinService.subscribeAccountEvents();
            // save account to wallet
            this.walletService.addAccount(tokenAccount);
            this.active_icon = 'fa fa-check';
            this.showImportKeyDialog = false;
            this.showSuccessImport = true;
            this.importAccountSecret = '';
            this.walletPassword = '';
            this.footer_message = '';
            this.footer_visible = false;
            this.checked = false;
            setTimeout(() => {
              this.showSuccessImport = false;
            }, 2500);
          });
        } else {
          this.footer_message = 'Invalid account secret entered!';
          this.active_icon = 'fa fa-check';
          this.footer_visible = true;
          this.importAccountSecret = '';
          this.walletPassword = '';
        }
      } else {
        this.footer_message = 'Invalid wallet password entered!';
        this.active_icon = 'fa fa-check';
        this.footer_visible = true;
        this.walletPassword = '';
      }
  }

  executeKeyImport() {
    this.importAccountSecret = this.importAccountSecret.trim();
    this.logger.debug('### HOME - Execute Key Import Choice: ' + this.importSecretChoice);
    this.active_icon = 'pi fa-spin pi-spinner';
    // check password
    const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    if (this.walletService.checkWalletPasswordHash(this.walletPassword, walletObject.walletUUID, walletObject.passwordHash)) {
      // check the destination account id
      if (this.casinocoinService.cscAPI.isValidSecret(this.importAccountSecret.trim())) {
        // determine account from secret
        const importKeyPair = this.casinocoinService.cscAPI.deriveKeypair(this.importAccountSecret);
        this.logger.debug('### HOME KeyPair: ' + JSON.stringify(importKeyPair));
        const accountID = this.casinocoinService.cscAPI.deriveAddress(importKeyPair.publicKey);
        this.logger.debug('### HOME AccountID: ' + accountID);
        const userEmail = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail;
        const secretsCSCCrypto = new CSCCrypto(this.walletPassword, userEmail);
        // get fees, account reserve
        const fees = this.casinocoinService.serverInfo.validatedLedger.baseFeeCSC;
        const accountReserve = this.casinocoinService.serverInfo.validatedLedger.reserveBaseCSC;
        const ownerReserve = Number(this.casinocoinService.serverInfo.validatedLedger.reserveIncrementCSC);
        // check if importing into existing or new account
        // if (this.importSecretChoice === 'existing') {
          // get main account to import
          const mainAccount: LokiTypes.LokiAccount = this.walletService.getMainAccount();
          const mainAccountKey: LokiKey = this.walletService.getKey(mainAccount.accountID);
          const mainAccountDecryptedSecret = secretsCSCCrypto.decrypt(mainAccountKey.secret);
          this.logger.debug('### mainAccountKey: ' + JSON.stringify(mainAccountKey));
          let ledgerBalances: any;
          let balanceCountHandled = 0;
          const tokenReadyForTransferSubject = new Subject<any>();
          // get account balances to import
          this.casinocoinService.cscAPI.getBalances(accountID).then(async balances => {
            this.logger.debug('### HOME balances: ' + JSON.stringify(balances));
            ledgerBalances = balances;
            const requiredOwnerReserve = ownerReserve * balances.length;
            const requiredFees =  Number(fees) * balances.length * 2;
            this.importRequiredTotalReserve = new Big(CSCUtil.cscToDrops(accountReserve)).plus(new Big(CSCUtil.cscToDrops(requiredFees.toString()))).plus(new Big(CSCUtil.cscToDrops(requiredOwnerReserve.toString())));
            const cscBalance = balances.find( item => item.currency === 'CSC');
            const importCSCValue = new Big(CSCUtil.cscToDrops(cscBalance.value)).minus(this.importRequiredTotalReserve);
            this.logger.debug('### HOME requiredTotalReserve: ' + this.importRequiredTotalReserve);
            if ( importCSCValue > 0) {
              // check if we only have CSC to move
              if (balances.length === 1 && cscBalance !== undefined) {
                const cscPayment: any = {
                  source: { address: accountID, maxAmount: { value: CSCUtil.dropsToCsc(importCSCValue.toString()), currency: cscBalance.currency } },
                  destination: { address: mainAccount.accountID, amount: { value: CSCUtil.dropsToCsc(importCSCValue.toString()), currency: cscBalance.currency } }
                };
                this.logger.debug('### HOME import csc payment: ' + JSON.stringify(cscPayment));
                try {
                  const preparedPayment = await this.casinocoinService.cscAPI.preparePayment(accountID, cscPayment);
                  this.logger.debug('### HOME CSC Prepared Payment Result: ' + JSON.stringify(preparedPayment));

                  const paymentSignResult = await this.casinocoinService.cscAPI.sign(preparedPayment.txJSON, this.importAccountSecret);
                  this.logger.debug('### Payment Sign Result: ' + JSON.stringify(paymentSignResult));

                  const cscPaymentSubmitResult = await this.casinocoinService.cscAPI.submit(paymentSignResult.signedTransaction);
                  this.logger.debug('### Payment Submit Result: ' + JSON.stringify(cscPaymentSubmitResult));

                  // save the wallet
                  this.walletService.saveWallet();
                  // refresh lists
                  this.casinocoinService.refreshAccountTokenList();
                  // subcribe to all accounts again
                  this.casinocoinService.subscribeAccountEvents();
                  this.active_icon = 'fa fa-check';
                  this.showImportKeyDialog = false;
                  this.importAccountSecret = '';
                  this.walletPassword = '';
                  this.footer_message = '';
                  this.footer_visible = false;
                  this.router.navigate(['home', 'tokenlist']);
                } catch (error) {
                  console.log(error, error.message);
                  this.footer_message = 'err.message';
                  this.active_icon = 'fa fa-check';
                  this.footer_visible = true;
                  this.importAccountSecret = '';
                  this.walletPassword = '';
                }
              } else {
                balances.forEach(balance => {
                  if (balance.currency !== 'CSC') {
                    // check if main account has a trustline for this token
                    let tokenAccount = this.walletService.getAccount(balance.currency, mainAccount.accountID);
                    if (tokenAccount === null) {
                      // create new account
                      const tokenInfo = this.casinocoinService.getTokenInfo(balance.currency);
                      tokenAccount = {
                          pk: (tokenInfo.Token + mainAccount.accountID),
                          accountID: mainAccount.accountID,
                          balance: mainAccount.balance,
                          accountSequence: mainAccount.accountSequence,
                          currency: tokenInfo.Token,
                          tokenBalance: '0',
                          lastSequence: mainAccount.lastSequence,
                          label: tokenInfo.FullName,
                          activated: true,
                          ownerCount: mainAccount.ownerCount,
                          lastTxID: mainAccount.lastTxID,
                          lastTxLedger: mainAccount.lastTxLedger
                      };
                      // save account to wallet
                      this.walletService.addAccount(tokenAccount);
                      // no token account yet so create trustline for it on the main account and add new token account
                      const trustline = {
                        currency: tokenInfo.Token,
                        counterparty: tokenInfo.Issuer,
                        limit: tokenInfo.TotalSupply
                      };
                      this.casinocoinService.cscAPI.prepareTrustline(mainAccount.accountID, trustline).then( preparedTrust => {
                        this.logger.debug('### HOME Trustline Result: ' + JSON.stringify(preparedTrust));
                        return this.casinocoinService.cscAPI.sign(preparedTrust.txJSON, mainAccountDecryptedSecret);
                      }).then( trustSignResult => {
                        this.logger.debug('### Trustline Sign Result: ' + JSON.stringify(trustSignResult));
                        return this.casinocoinService.cscAPI.submit(trustSignResult.signedTransaction);
                      }).then( trustSubmitResult => {
                        this.logger.debug('### Trustline Submit Result: ' + JSON.stringify(trustSubmitResult));
                        // mark balance ready for payment
                        tokenReadyForTransferSubject.next(balance);
                      });
                    } else {
                      // we only need to move the assets
                      tokenReadyForTransferSubject.next(balance);
                    }
                  }
                });
              }
            } else {
              this.footer_message = 'Not enough CSC in the source account to handle all required transactions.';
              this.active_icon = 'fa fa-check';
              this.footer_visible = true;
              this.importAccountSecret = '';
              this.walletPassword = '';
            }
          });
          // subsribe to subject for sending amounts
          tokenReadyForTransferSubject.subscribe( tokenBalance => {

            // create payment and send all tokens to main account
            if (Number(tokenBalance.value > 0)) {
              const tokenPayment: any = {
                source: { address: accountID, maxAmount: { value: tokenBalance.value, currency: tokenBalance.currency, counterparty: tokenBalance.counterparty } },
                destination: { address: mainAccount.accountID, amount: { value: tokenBalance.value, currency: tokenBalance.currency, counterparty: tokenBalance.counterparty }
                }
              };
              this.logger.debug('### HOME import token payment: ' + JSON.stringify(tokenPayment));
              this.casinocoinService.cscAPI.preparePayment(accountID, tokenPayment).then( preparedPayment => {
                this.logger.debug('### HOME Prepare Payment Result: ' + JSON.stringify(preparedPayment));
                return this.casinocoinService.cscAPI.sign(preparedPayment.txJSON, this.importAccountSecret);
              }).then( paymentSignResult => {
                this.logger.debug('### Payment Sign Result: ' + JSON.stringify(paymentSignResult));
                return this.casinocoinService.cscAPI.submit(paymentSignResult.signedTransaction);
              }).then( paymentSubmitResult => {
                this.logger.debug('### Payment Submit Result: ' + JSON.stringify(paymentSubmitResult));
                // check if we did the last token balance
                balanceCountHandled++;
                this.logger.debug('### HOME balances: ' + ledgerBalances.length + ' Handled: ' + balanceCountHandled);
                if (ledgerBalances.length === (balanceCountHandled + 1) ) {
                  // we still need to move out CSC
                  ledgerBalances.forEach( balance => {
                    if (balance.currency === 'CSC') {
                      const sendCSCAmount = new Big(CSCUtil.cscToDrops(balance.value)).minus(this.importRequiredTotalReserve);
                      const cscPayment: any = {
                        source: { address: accountID, maxAmount: { value: CSCUtil.dropsToCsc(sendCSCAmount.toString()), currency: balance.currency } },
                        destination: { address: mainAccount.accountID, amount: { value: CSCUtil.dropsToCsc(sendCSCAmount.toString()), currency: balance.currency } }
                      };
                      this.logger.debug('### HOME import csc payment: ' + JSON.stringify(cscPayment));
                      this.casinocoinService.cscAPI.preparePayment(accountID, cscPayment).then( preparedPayment => {
                        this.logger.debug('### HOME CSC Prepared Payment Result: ' + JSON.stringify(preparedPayment));
                        return this.casinocoinService.cscAPI.sign(preparedPayment.txJSON, this.importAccountSecret);
                      }).then( paymentSignResult => {
                        this.logger.debug('### Payment Sign Result: ' + JSON.stringify(paymentSignResult));
                        return this.casinocoinService.cscAPI.submit(paymentSignResult.signedTransaction);
                      }).then( cscPaymentSubmitResult => {
                        this.logger.debug('### Payment Submit Result: ' + JSON.stringify(cscPaymentSubmitResult));
                        balanceCountHandled++;
                        // save the wallet
                        this.walletService.saveWallet();
                        // refresh lists
                        this.casinocoinService.refreshAccountTokenList();
                        // subcribe to all accounts again
                        this.casinocoinService.subscribeAccountEvents();
                        this.active_icon = 'fa fa-check';
                        this.showImportKeyDialog = false;
                        this.importAccountSecret = '';
                        this.walletPassword = '';
                        this.footer_message = '';
                        this.footer_visible = false;
                        this.router.navigate(['home', 'tokenlist']);
                      });
                    }
                  });
                }
              });
            } else {
              // check if we did the last token balance
              balanceCountHandled++;
              this.logger.debug('### HOME balances: ' + ledgerBalances.length + ' Handled: ' + balanceCountHandled);
              if (ledgerBalances.length === (balanceCountHandled + 1) ) {
                // we still need to move out CSC
                ledgerBalances.forEach( balance => {
                  if (balance.currency === 'CSC') {
                    const sendCSCAmount = new Big(CSCUtil.cscToDrops(balance.value)).minus(this.importRequiredTotalReserve);
                    const cscPayment: any = {
                      source: { address: accountID, maxAmount: { value: CSCUtil.dropsToCsc(sendCSCAmount.toString()), currency: balance.currency } },
                      destination: { address: mainAccount.accountID, amount: { value: CSCUtil.dropsToCsc(sendCSCAmount.toString()), currency: balance.currency } }
                    };
                    this.logger.debug('### HOME import csc payment: ' + JSON.stringify(cscPayment));
                    this.casinocoinService.cscAPI.preparePayment(accountID, cscPayment).then( preparedPayment => {
                      this.logger.debug('### HOME CSC Prepared Payment Result: ' + JSON.stringify(preparedPayment));
                      return this.casinocoinService.cscAPI.sign(preparedPayment.txJSON, this.importAccountSecret);
                    }).then( paymentSignResult => {
                      this.logger.debug('### Payment Sign Result: ' + JSON.stringify(paymentSignResult));
                      return this.casinocoinService.cscAPI.submit(paymentSignResult.signedTransaction);
                    }).then( cscPaymentSubmitResult => {
                      this.logger.debug('### Payment Submit Result: ' + JSON.stringify(cscPaymentSubmitResult));
                      balanceCountHandled++;
                      // save the wallet
                      this.walletService.saveWallet();
                      // refresh lists
                      this.casinocoinService.refreshAccountTokenList();
                      // subcribe to all accounts again
                      this.casinocoinService.subscribeAccountEvents();
                      this.active_icon = 'fa fa-check';
                      this.showImportKeyDialog = false;
                      this.importAccountSecret = '';
                      this.walletPassword = '';
                      this.footer_message = '';
                      this.footer_visible = false;
                      this.router.navigate(['home', 'tokenlist']);
                    });
                  }
                });
              }
            }
          });
        // } else {
        //   // user selected to add account for secret to this wallet
        //   const newKeyPair: LokiKey = {
        //     accountID: accountID,
        //     encrypted: false,
        //     privateKey: importKeyPair.privateKey,
        //     publicKey: importKeyPair.publicKey,
        //     secret: this.importAccountSecret
        //   };
        //   this.walletService.addKey(newKeyPair);
        //   // loop over balances and add accounts
        //   let ledgerAccount;
        //   this.casinocoinService.cscAPI.getAccountInfo(accountID).then(accountInfo => {
        //     ledgerAccount = accountInfo;
        //     return this.casinocoinService.cscAPI.getBalances(accountID);
        //   }).then(balances => {
        //     balances.forEach(balance => {
        //       this.logger.debug('### HOME balance: ' + JSON.stringify(balance));
        //       // create new account
        //       if (balance.currency !== 'CSC') {
        //         const tokenInfo = this.casinocoinService.getTokenInfo(balance.currency);
        //         const tokenAccount = {
        //             pk: (tokenInfo.Token + accountID),
        //             accountID: accountID,
        //             balance: CSCUtil.cscToDrops(ledgerAccount.cscBalance),
        //             accountSequence: -1,
        //             currency: tokenInfo.Token,
        //             tokenBalance: CSCUtil.cscToDrops(balance.value),
        //             lastSequence: ledgerAccount.sequence,
        //             label: tokenInfo.FullName,
        //             activated: true,
        //             ownerCount: ledgerAccount.ownerCount,
        //             lastTxID: ledgerAccount.previousAffectingTransactionID,
        //             lastTxLedger: ledgerAccount.previousAffectingTransactionLedgerVersion
        //         };
        //         this.logger.debug('### HOME account: ' + JSON.stringify(tokenAccount));
        //         // save account to wallet
        //         this.walletService.addAccount(tokenAccount);
        //       } else {
        //         const tokenAccount = {
        //             pk: ('CSC' + accountID),
        //             accountID: accountID,
        //             balance: CSCUtil.cscToDrops(ledgerAccount.cscBalance),
        //             accountSequence: -1,
        //             currency: 'CSC',
        //             tokenBalance: '0',
        //             lastSequence: ledgerAccount.sequence,
        //             label: 'CSC Account',
        //             activated: true,
        //             ownerCount: ledgerAccount.ownerCount,
        //             lastTxID: ledgerAccount.previousAffectingTransactionID,
        //             lastTxLedger: ledgerAccount.previousAffectingTransactionLedgerVersion
        //         };
        //         this.logger.debug('### HOME account: ' + JSON.stringify(tokenAccount));
        //         // save account to wallet
        //         this.walletService.addAccount(tokenAccount);
        //       }
        //     });
        //     // encrypt all keys
        //     this.walletService.encryptAllKeys(this.walletPassword, userEmail).subscribe( encryptResult => {
        //         if (encryptResult === AppConstants.KEY_FINISHED) {
        //           this.logger.debug('### HOME Import - Key Encryption Complete');
        //           // save the wallet
        //           this.walletService.saveWallet();
        //           // refresh lists
        //           this.casinocoinService.refreshAccountTokenList();
        //           // subcribe to all accounts again
        //           this.casinocoinService.subscribeAccountEvents();
        //           // close dialog
        //           this.active_icon = 'fa fa-check';
        //           this.showImportKeyDialog = false;
        //           this.importAccountSecret = '';
        //           this.walletPassword = '';
        //           this.footer_message = '';
        //           this.footer_visible = false;
        //           this.router.navigate(['home', 'tokenlist']);
        //         }
        //     });
        //   });
        // }
      } else {
        // invalid secret
        this.footer_message = 'Invalid account secret entered!';
        this.active_icon = 'fa fa-check';
        this.footer_visible = true;
        this.importAccountSecret = '';
        this.walletPassword = '';
      }
    } else {
      this.footer_message = 'Invalid wallet password entered!';
      this.active_icon = 'fa fa-check';
      this.footer_visible = true;
      this.walletPassword = '';
    }

  }

  backupWallet() {
    this.logger.debug('### HOME Backup Wallet DB ###');
    // get DB dump
    const dbDump = this.walletService.getWalletDump();
    // create backup object
    const backup = {
      DB: dbDump,
      LocalStorage: []
    };
    // get all localstorage keys
    this.localStorageService.keys.forEach( keyItem => {
      this.logger.debug('### HOME LocalStorage: ' + JSON.stringify(keyItem));
      const key = keyItem.substr(4);
      const value = this.localStorageService.get(key);
      backup.LocalStorage.push({key: key, value: value});
    });
    // create a filename
    const filename = this.datePipe.transform(Date.now(), 'yyyy-MM-dd-HH-mm-ss') + '-csc-wlt-wallet.backup';
    const backupFilePath = path.join(this.backupPath, filename);
    this.logger.info('### HOME Backup Location: ' + backupFilePath);
    // Write the backup object to the file
    fs.writeFileSync(backupFilePath, JSON.stringify(backup));
  }

  saveCopyValue(field) {
    this.logger.debug('### HOME saveCopyValue: ' + field);
    if (field === 'signPubKey') {
      this.copiedValue = this.signPubKey;
    } else if (field === 'signSignature') {
      this.copiedValue = this.signSignature;
    }
    this.copy_context_menu.popup({window: this.electron.remote.getCurrentWindow()});

  }

  copyValueToClipboard() {
    this.electron.clipboard.writeText(this.copiedValue);
  }
}
