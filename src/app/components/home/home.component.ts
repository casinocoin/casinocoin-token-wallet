import { Component, OnInit, OnDestroy } from '@angular/core';
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
import { LokiKey } from '../../domains/lokijs';
import * as LokiTypes from '../../domains/lokijs';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { CasinocoinAPI } from '@casinocoin/libjs';
import { SelectItem, Message, MenuItem as PrimeMenuItem } from 'primeng/api';
import { GetServerInfoResponse } from '@casinocoin/libjs/common/serverinfo';
import { TranslateService } from '@ngx-translate/core';
import Big from 'big.js';
import { CSCCrypto } from '../../domains/csc-crypto';
import { DatePipe } from '@angular/common';
const path = require('path');
const fs = require('fs');

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {

  walletSettings: WalletSettings = {showNotifications: true, fiatCurrency: 'USD'};
  fiatCurrencies: SelectItem[] = [];
  selectedFiatCurrency: string;
  currentWalletObject: WalletDefinition;
  active_menu_item: string;
  balance: string;
  fiat_balance: string;
  connected_tooltip: string;

  show_menu = 'small';
  menu_items: PrimeMenuItem[];
  tools_context_menu: ElectronMenu;
  connection_context_menu: ElectronMenu;

  applicationVersion: string;
  serverVersion: string;

  showPrivateKeyImportDialog = false;
  showSettingsDialog = false;
  showServerInfoDialog = false;
  showPasswordDialog = false;
  showPasswordCallback: any;

  privateKeySeed: string;
  walletPassword: string;
  importFileObject: Object;

  privateKeyExportLocation: string;
  privateKeyImportfile: string;
  importKeys: Array<LokiKey> = [];

  // Growl messages
  msgs: Message[] = [];

  isConnected = new BehaviorSubject<boolean>(false);
  connected_icon = 'fa fa-wifi fa-2x';
  connectionColorClass = 'connected-color';
  connectionImage = 'assets/icons/connected.png';
  active_icon = 'fa fa-check';
  manualDisconnect = false;
  searchDate: Date;

  serverState: any;
  currentServer: GetServerInfoResponse;
  currentLedger: LedgerStreamMessages;
  casinocoinConnectionSubject: Observable<any>;
  uiChangeSubject = new BehaviorSubject<string>(AppConstants.KEY_INIT);

  walletBalance: string;
  transaction_count: number;
  last_transaction: number;

  footer_visible = false;
  error_message: string;
  footer_message: string;
  passwordDialogHeader = 'CasinoCoin Wallet Password';

  backupPath: string;

  showSignMessageDialog = false;
  showVerifyMessageDialog = false;
  accounts: SelectItem[] = [];
  selectedAccount: string;
  msgToSign: string;
  signPubKey: string;
  signSignature: string;
  msgToVerify: string;
  verifyPubKey: string;
  verifySignature: string;
  verificationFinished = false;
  verificationResult = false;

  copy_context_menu: ElectronMenu;
  copiedValue: string;
  walletCloseReceived = false;
  showImportKeyDialog = false;
  importAccountSecret: string;
  importRequiredTotalReserve: any;
  importSecretChoice = 'existing';

  constructor( private logger: LogService,
               private electron: ElectronService,
               private walletService: WalletService,
               private casinocoinService: CasinocoinService,
               private marketService: MarketService,
               private localStorageService: LocalStorageService,
               private sessionStorageService: SessionStorageService,
               private translate: TranslateService,
               private router: Router,
               private datePipe: DatePipe ) {
    this.logger.debug('### INIT Home');
    this.applicationVersion = this.electron.remote.app.getVersion();
  }

  ngOnInit() {
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
    // define Connection context menu
    const connect_context_menu_template = [
      { label: 'Connect to Network',
        click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('connect-context-menu-event', 'connect'); }, visible: true
        },
        { label: 'Disconnect from Network',
          click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('connect-context-menu-event', 'disconnect'); }, visible: false
        },
        { label: 'Server Information',
          click(menuItem, browserWindow, event) {
              browserWindow.webContents.send('connect-context-menu-event', 'server-info'); }, visible: false
        }
      ];
    this.connection_context_menu = this.electron.remote.Menu.buildFromTemplate(connect_context_menu_template);
    // define Tools context menu
    const tools_context_menu_template = [
      { label: 'Import Private Key', click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('context-menu-event', 'import-priv-key');
          }
      }
    ];
    this.tools_context_menu = this.electron.remote.Menu.buildFromTemplate(tools_context_menu_template);
    // paperwallet submenu
    // const paperWalletMenu = { label: 'Paper Wallet', submenu: [
    //   { label: 'Generate Paper Wallet',
    //     click(menuItem, browserWindow, event) {
    //       browserWindow.webContents.send('context-menu-event', 'paper-wallet');
    //     }, enabled: true
    //   },
    //   { label: 'Import Paper Wallet',
    //     click(menuItem, browserWindow, event) {
    //       browserWindow.webContents.send('context-menu-event', 'import-paper-wallet');
    //     }, enabled: true
    //   }
    // ]};
    // this.tools_context_menu.append(new this.electron.remote.MenuItem(paperWalletMenu));
    // message signing submenu
    // const messageSigningMenu = { label: 'Message Signing', submenu: [
    //     { label: 'Sign Message',
    //       click(menuItem, browserWindow, event) {
    //         browserWindow.webContents.send('context-menu-event', 'sign-message');
    //       }, enabled: true
    //     },
    //     { label: 'Verify Message',
    //       click(menuItem, browserWindow, event) {
    //         browserWindow.webContents.send('context-menu-event', 'verify-message');
    //       }, enabled: true
    //     }
    //   ]};
    // this.tools_context_menu.append(new this.electron.remote.MenuItem(messageSigningMenu));
    // listen to connect context menu events
    this.electron.ipcRenderer.on('connect-context-menu-event', (event, arg) => {
      this.logger.debug('### connect-context-menu-event: ' + arg);
      if (arg === 'connect') {
        this.onConnect();
      } else if (arg === 'disconnect') {
        this.onDisconnect();
      } else if (arg === 'server-info') {
        this.onServerInfo();
      }
    });
    // listen to tools context menu events
    this.electron.ipcRenderer.on('context-menu-event', (event, arg) => {
      this.logger.debug('### HOME Menu Event: ' + arg);
      if (arg === 'import-priv-key') {
        this.onPrivateKeyImport();
      } else {
        this.logger.debug('### Context menu not implemented: ' + arg);
      }
    });
    this.electron.ipcRenderer.on('update-message', (event, arg) => {
      this.logger.info('### HOME Received Auto Update Message: ' + arg);
    });
  }

  ngOnDestroy() {
    this.logger.debug('### HOME OnDestroy');
  }

  listenForMainEvents() {
    // Listen for electron main events
    this.electron.ipcRenderer.on('action', (event, arg) => {
      this.logger.info('### HOME Received Action: ' + arg);
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
    this.walletBalance = this.walletService.getWalletBalance('CSC') ? this.walletService.getWalletBalance('CSC') : '0';
    this.logger.debug('### HOME - Wallet Balance: ' + this.walletBalance);
    this.balance = CSCUtil.dropsToCsc(this.walletBalance);
    // let balanceCSC = new Big(this.balance);
    // if(this.marketService.coinMarketInfo != null && this.marketService.coinMarketInfo.price_fiat !== undefined){
    //   this.logger.debug("### CSC Price: " + this.marketService.cscPrice + " BTC: " + this.marketService.btcPrice + " Fiat: " + this.marketService.coinMarketInfo.price_fiat);
    //   let fiatValue = balanceCSC.times(new Big(this.marketService.coinMarketInfo.price_fiat)).toString();
    //   this.fiat_balance = this.currencyPipe.transform(fiatValue, this.marketService.coinMarketInfo.selected_fiat, "symbol", "1.2-2");
    // }
  }

  updateMarketService(event) {
    if (this.walletSettings.fiatCurrency !== undefined) {
        this.marketService.changeCurrency(this.walletSettings.fiatCurrency);
    }
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
        if (this.importSecretChoice === 'existing') {
          // get main account to import
          const mainAccount: LokiTypes.LokiAccount = this.walletService.getMainAccount();
          const mainAccountKey: LokiKey = this.walletService.getKey(mainAccount.accountID);
          const mainAccountDecryptedSecret = secretsCSCCrypto.decrypt(mainAccountKey.secret);
          this.logger.debug('### mainAccountKey: ' + JSON.stringify(mainAccountKey));
          let ledgerBalances: any;
          let balanceCountHandled = 0;
          const tokenReadyForTransferSubject = new Subject<any>();
          // get account balances to import
          this.casinocoinService.cscAPI.getBalances(accountID).then(balances => {
            this.logger.debug('### HOME balances: ' + JSON.stringify(balances));
            ledgerBalances = balances;
            const requiredOwnerReserve = ownerReserve * balances.length;
            const requiredFees =  Number(fees) * balances.length * 2;
            this.importRequiredTotalReserve = new Big(CSCUtil.cscToDrops(accountReserve)).plus(new Big(CSCUtil.cscToDrops(requiredFees.toString()))).plus(new Big(CSCUtil.cscToDrops(requiredOwnerReserve.toString())));
            const cscBalance = balances.find( item => item.currency === 'CSC');
            const importCSCValue = new Big(CSCUtil.cscToDrops(cscBalance.value)).minus(this.importRequiredTotalReserve);
            this.logger.debug('### HOME requiredTotalReserve: ' + this.importRequiredTotalReserve);
            if ( importCSCValue > 0) {
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
          });
        } else {
          // user selected to add account for secret to this wallet
          const newKeyPair: LokiKey = {
            accountID: accountID,
            encrypted: false,
            privateKey: importKeyPair.privateKey,
            publicKey: importKeyPair.publicKey,
            secret: this.importAccountSecret
          };
          this.walletService.addKey(newKeyPair);
          // loop over balances and add accounts
          let ledgerAccount;
          this.casinocoinService.cscAPI.getAccountInfo(accountID).then(accountInfo => {
            ledgerAccount = accountInfo;
            return this.casinocoinService.cscAPI.getBalances(accountID);
          }).then(balances => {
            balances.forEach(balance => {
              this.logger.debug('### HOME balance: ' + JSON.stringify(balance));
              // create new account
              if (balance.currency !== 'CSC') {
                const tokenInfo = this.casinocoinService.getTokenInfo(balance.currency);
                const tokenAccount = {
                    pk: (tokenInfo.Token + accountID),
                    accountID: accountID,
                    balance: CSCUtil.cscToDrops(ledgerAccount.cscBalance),
                    accountSequence: -1,
                    currency: tokenInfo.Token,
                    tokenBalance: CSCUtil.cscToDrops(balance.value),
                    lastSequence: ledgerAccount.sequence,
                    label: tokenInfo.FullName,
                    activated: true,
                    ownerCount: ledgerAccount.ownerCount,
                    lastTxID: ledgerAccount.previousAffectingTransactionID,
                    lastTxLedger: ledgerAccount.previousAffectingTransactionLedgerVersion
                };
                this.logger.debug('### HOME account: ' + JSON.stringify(tokenAccount));
                // save account to wallet
                this.walletService.addAccount(tokenAccount);
              } else {
                const tokenAccount = {
                    pk: ('CSC' + accountID),
                    accountID: accountID,
                    balance: CSCUtil.cscToDrops(ledgerAccount.cscBalance),
                    accountSequence: -1,
                    currency: 'CSC',
                    tokenBalance: '0',
                    lastSequence: ledgerAccount.sequence,
                    label: 'CSC Account',
                    activated: true,
                    ownerCount: ledgerAccount.ownerCount,
                    lastTxID: ledgerAccount.previousAffectingTransactionID,
                    lastTxLedger: ledgerAccount.previousAffectingTransactionLedgerVersion
                };
                this.logger.debug('### HOME account: ' + JSON.stringify(tokenAccount));
                // save account to wallet
                this.walletService.addAccount(tokenAccount);
              }
            });
            // encrypt all keys
            this.walletService.encryptAllKeys(this.walletPassword, userEmail).subscribe( encryptResult => {
                if (encryptResult === AppConstants.KEY_FINISHED) {
                  this.logger.debug('### HOME Import - Key Encryption Complete');
                  // save the wallet
                  this.walletService.saveWallet();
                  // refresh lists
                  this.casinocoinService.refreshAccountTokenList();
                  // subcribe to all accounts again
                  this.casinocoinService.subscribeAccountEvents();
                  // close dialog
                  this.active_icon = 'fa fa-check';
                  this.showImportKeyDialog = false;
                  this.importAccountSecret = '';
                  this.walletPassword = '';
                  this.footer_message = '';
                  this.footer_visible = false;
                  this.router.navigate(['home', 'tokenlist']);
                }
            });
          });
        }
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
    //   const importValue = new Big(CSCUtil.cscToDrops(account.cscBalance)).minus(new Big(CSCUtil.cscToDrops(accountReserve))).minus(new Big(CSCUtil.cscToDrops(fees))).minus(new Big(CSCUtil.cscToDrops(ownerReserve.toString())));
    //   this.logger.debug('### HOME fees: ' + fees + ' reserve: ' + accountReserve + ' importValue: ' + importValue);
    //   this.footer_message = 'Importing ' + CSCUtil.dropsToCsc(importValue.toString()) + ' CSC from account ' + accountID;
    //   this.footer_visible = true;
    //   const payment: any = {
    //     source: { address: accountID, maxAmount: { value: CSCUtil.dropsToCsc(importValue.toString()), currency: 'CSC' } },
    //     destination: { address: mainAccount.accountID, amount: { value: CSCUtil.dropsToCsc(importValue.toString()), currency: 'CSC' }
    //     }
    //   };
    //   this.logger.debug('### HOME - payment: ' + JSON.stringify(payment));
    //   return this.casinocoinService.cscAPI.preparePayment(accountID, payment);
    // }).then(prepared => {
    //   this.logger.debug('### Prepared: ' + JSON.stringify(prepared));
    //   return this.casinocoinService.cscAPI.sign(prepared.txJSON, this.importAccountSecret);
    // }).then( signResult => {
    //   this.logger.debug('### Sign Result: ' + JSON.stringify(signResult));
    //   return this.casinocoinService.cscAPI.submit(signResult.signedTransaction);
    // }).then( submitResult => {
    //   this.logger.debug('### Submit Result: ' + JSON.stringify(submitResult));
    //   if (submitResult['resultCode'] === 'tesSUCCESS') {
    //     this.importAccountSecret = '';
    //     this.showImportKeyDialog = false;
    //     this.active_icon = 'fa fa-check';
    //     this.footer_visible = false;
    //   } else {
    //     this.importAccountSecret = '';
    //     this.footer_message = submitResult['resultMessage'];
    //     this.active_icon = 'fa fa-check';
    //   }

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
}
