import { Component, OnInit, AfterViewInit, ViewChild, Renderer2, NgZone } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { timer } from 'rxjs';
import { LogService } from '../../providers/log.service';
import { CasinocoinService } from '../../providers/casinocoin.service';
import { WalletService } from '../../providers/wallet.service';
import { CSCUtil } from '../../domains/csc-util';
import { AppConstants } from '../../domains/app-constants';
import { LokiKey, LokiAccount } from '../../domains/lokijs';
import { ElectronService } from '../../providers/electron.service';
import { Menu as ElectronMenu, MenuItem as ElectronMenuItem } from 'electron';
import { AppConfig } from '../../../environments/environment';
import { LedgerStreamMessages, TokenType, Payment, WalletDefinition } from '../../domains/csc-types';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { FormGroup, FormBuilder, FormControl, Validators } from '@angular/forms';
import { CSCCrypto } from '../../domains/csc-crypto';
import { SessionStorageService } from 'ngx-store';
import Big from 'big.js';
import { NotificationService } from '../../providers/notification.service';
import { SelectItem } from 'primeng/primeng';
import { CSCAmountPipe } from '../../app-pipes.module';

@Component({
  selector: 'app-tokenlist',
  templateUrl: './tokenlist.component.html',
  styleUrls: ['./tokenlist.component.scss'],
  animations: [
    trigger('rowExpansionTrigger', [
        state('void', style({
            transform: 'translateX(-10%)',
            opacity: 0
        })),
        state('active', style({
            transform: 'translateX(0)',
            opacity: 1
        })),
        transition('* <=> *', animate('400ms cubic-bezier(0.86, 0, 0.07, 1)'))
    ])
]
})
export class TokenlistComponent implements OnInit {

  columnCount: number;
  tokenlist: Array<TokenType>;
  ledgers: LedgerStreamMessages[] = [];
  receipient: string;
  description: string;
  amount: string;
  fees: string;
  accountReserve: string;
  reserveIncrement: string;
  walletPassword: string;
  showPasswordDialog: boolean;
  showLedgerDialog: boolean;
  showAddTokenDialog: boolean;
  showAddCSCDialog: boolean;
  signAndSubmitIcon: string;
  token_context_menu: ElectronMenu;
  translateParams = {accountReserve: '10'};
  cscBalance: string;
  canActivateToken: boolean;
  currentToken: TokenType;
  sendForm: FormGroup;
  activateForm: FormGroup;
  mainCSCAccountID: string;
  availableTokenlist: Array<TokenType> = [];
  addToken: TokenType;
  addIcon = 'fa fa-plus';
  footer_visible = false;
  error_message: string;
  cscAccounts: SelectItem[] = [];
  selectedCSCAccount: string;
  addTokenAccountSelected: boolean;
  showErrorDialog = false;

  public cscReceiveURI: string = null;
  showReceiveQRCodeDialog = false;
  sendAmount: string;
  destinationTag: number;
  label: string;
  copyIcon = 'fa fa-copy';

  showSecretDialog = false;
  showSecret = false;
  accountSecret: string;

  showEditAccountLabel = false;
  accountLabel = '';

  constructor(private logger: LogService,
              private casinocoinService: CasinocoinService,
              private sessionStorageService: SessionStorageService,
              private walletService: WalletService,
              private notificationService: NotificationService,
              private electronService: ElectronService,
              private router: Router,
              private route: ActivatedRoute,
              private fb: FormBuilder,
              public renderer: Renderer2,
              private _ngZone: NgZone,
              private cscAmountPipe: CSCAmountPipe) { }

  ngOnInit() {
    this.logger.debug('### TokenList ngOnInit() ###');
    this.columnCount = 5;
    // initialize sendForm
    this.sendForm = this.fb.group({
        'amount': new FormControl('', Validators.compose([Validators.required])),
        'accountid': new FormControl('', Validators.compose([Validators.required])),
        'password': new FormControl('', Validators.compose([Validators.required])),
        'fees': new FormControl(''),
        'destinationtag': new FormControl(''),
        'description': new FormControl('')
    });
    this.sendForm.valueChanges.subscribe(val => {
      this.logger.debug('### TokenList - sendForm changed: ' + JSON.stringify(val));
    });
    // initialize activateForm
    this.activateForm = this.fb.group({
      'password': new FormControl('', Validators.compose([Validators.required]))
    });
    // refresh server list
    this.casinocoinService.updateServerList();
    // connect to CasinoCoin network
    this.casinocoinService.connectSubject.subscribe( result => {
      if (result === AppConstants.KEY_CONNECTED) {
        // translation parameters
        // this.translateParams = {accountReserve: this.casinocoinService.serverInfo.reserveBaseCSC};
        // refresh Accounts
        this.logger.debug('### Account Refresh');
        this.casinocoinService.refreshAccounts().subscribe(accountRefreshFinished => {
          if (accountRefreshFinished) {
            // refresh Token List
            this.logger.debug('### TokenList Refresh');
            this.casinocoinService.refreshAccountTokenList().subscribe(finished => {
              if (finished) {
                this.tokenlist = this.casinocoinService.tokenlist;
                this.logger.debug('### TokenList: ' + JSON.stringify(this.tokenlist));
                // remove password from session if its still there
                this.sessionStorageService.remove(AppConstants.KEY_WALLET_PASSWORD);
              }
            });
            // Check if user password is still in the session
            const userPass = this.sessionStorageService.get(AppConstants.KEY_WALLET_PASSWORD);
            if (userPass != null) {
                this.sessionStorageService.remove(AppConstants.KEY_WALLET_PASSWORD);
            }
          }
        });
        // set fees
        this.fees = this.casinocoinService.serverInfo.validatedLedger.baseFeeCSC;
        this.accountReserve = this.casinocoinService.serverInfo.validatedLedger.reserveBaseCSC;
        this.reserveIncrement = this.casinocoinService.serverInfo.validatedLedger.reserveIncrementCSC;
        this.sendForm.controls.fees.setValue(this.fees);
      }
    });
    this.showPasswordDialog = false;
    this.showLedgerDialog = false;
    this.signAndSubmitIcon = 'pi pi-check';
    // define Transaction Context menu
    const token_context_menu_template = [
      { label: 'Copy Account',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('token-context-menu-event', 'copy-account'); }
      },
      { label: 'Show in Block Explorer',
        click(menuItem, browserWindow, event) {
            browserWindow.webContents.send('token-context-menu-event', 'show-explorer'); }
      },
      { label: 'Edit Label',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('token-context-menu-event', 'edit-account-label'); }
      },
      { label: 'Receive QRCode',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('token-context-menu-event', 'receive-qrcode');
        }
      },
      { label: 'Show Account Secret',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('token-context-menu-event', 'show-secret');
        }
      }
    ];
    this.token_context_menu = this.electronService.remote.Menu.buildFromTemplate(token_context_menu_template);
    // listen to connection context menu events
    this.electronService.ipcRenderer.on('token-context-menu-event', (event, arg) => {
      this._ngZone.run(() => {
        if (arg === 'copy-account') {
            this.electronService.clipboard.writeText(this.walletService.selectedTableAccount.AccountID);
        } else if (arg === 'edit-account-label') {
          this.doShowEditAccountLabel();
        } else if (arg === 'show-explorer') {
          this.showAccountOnExplorer(this.walletService.selectedTableAccount.AccountID);
        } else if (arg === 'receive-qrcode') {
          this.doShowReceiveQRCode();
        } else if (arg === 'show-secret') {
          this.doShowAccountSecretDialog();
        } else {
          this.logger.debug('### Context menu not implemented: ' + arg);
        }
      });
    });

    this.walletService.openWalletSubject.subscribe( result => {
      if (result === AppConstants.KEY_LOADED) {
        // get the main CSC AccountID
        console.log(this.walletService.getMainAccount());
        this.mainCSCAccountID = this.walletService.getMainAccount().accountID;
        // get all CSC accounts for add token dropdown
        this.walletService.getAllAccounts().forEach( element => {
          if (element.currency === 'CSC' && new Big(element.balance) > 0 && element.accountSequence >= 0) {
            const accountLabel = element.accountID.substring(0, 20) + '...' + ' [Balance: ' +
                                this.cscAmountPipe.transform(element.balance, false, true) + ']';
            this.cscAccounts.push({label: accountLabel, value: element.accountID});
          }
        });
        // subscribe to account updates
        this.casinocoinService.accountSubject.subscribe( account => {
          this.fees = this.casinocoinService.serverInfo.validatedLedger.baseFeeCSC;
          this.accountReserve = this.casinocoinService.serverInfo.validatedLedger.reserveBaseCSC;
          this.reserveIncrement = this.casinocoinService.serverInfo.validatedLedger.reserveIncrementCSC;
          // refresh all CSC accounts for add token dropdown
          this.cscAccounts = [];
          this.walletService.getAllAccounts().forEach( element => {
            if (element.currency === 'CSC' && new Big(element.balance) > 0  && element.accountSequence >= 0) {
              const accountLabel = element.accountID.substring(0, 20) + '...' + ' [Balance: ' +
                                  this.cscAmountPipe.transform(element.balance, false, true) + ']';
              this.cscAccounts.push({label: accountLabel, value: element.accountID});
            }
          });
        });
      }
    });
    // get network ledgers
    this.ledgers = this.casinocoinService.ledgers;
    // subscribe to account updates
    this.casinocoinService.accountSubject.subscribe( account => {
      // update our tokenlist
      this.tokenlist = this.casinocoinService.tokenlist;
      if (account.currency === 'CSC') {
        this.cscBalance = account.balance;
      }
    });
  }

  showTokenContextMenu(event) {
    this.logger.debug('### showTokenContextMenu: ' + JSON.stringify(event));
    this.walletService.selectedTableAccount = event.originalEvent.rowData;
    this.currentToken = event.originalEvent.rowData;
    this.token_context_menu.popup({window: this.electronService.remote.getCurrentWindow()});
  }

  showAccountOnExplorer(accountID: string){
    const infoUrl = AppConfig.explorer_endpoint_url + '/address/' + accountID;
    this.electronService.remote.shell.openExternal(infoUrl);
  }

  doShowLedgers() {
    this.showLedgerDialog = true;
  }

  doShowReceiveQRCode() {
    this.updateQRCode();
    this.logger.debug('### TokenList doShowReceiveQRCode: ' + this.cscReceiveURI);
    this.showReceiveQRCodeDialog = true;
  }

  updateQRCode() {
    const uriObject = {
      address: this.walletService.selectedTableAccount.AccountID,
      token: this.walletService.selectedTableAccount.Token
    };
    if (this.sendAmount && this.sendAmount.length > 0) {
      uriObject['amount'] = this.sendAmount;
    }
    if (this.destinationTag && (this.destinationTag > 0 && this.destinationTag < 2147483647)) {
      uriObject['destinationTag'] = this.destinationTag;
    }
    if (this.label && this.label.length > 0) {
      uriObject['label'] = this.label;
    }
    this.cscReceiveURI = CSCUtil.generateCSCQRCodeURI(uriObject);
  }

  copyAccountID() {
    this.logger.debug('### TokenList - copyAccountID(): ' + this.walletService.selectedTableAccount.AccountID);
    this.electronService.clipboard.writeText(this.walletService.selectedTableAccount.AccountID);
    this.copyIcon = 'pi pi-check';
    const finishTimer = timer(1000);
    finishTimer.subscribe(val =>  {
      this.copyIcon = 'fa fa-copy';
    });
  }

  doShowAccountSecretDialog() {
    this.logger.debug('### TokenList - doShowAccountSecret(): ' + this.walletService.selectedTableAccount.AccountID);
    this.showSecretDialog = true;
  }

  doShowAccountSecret() {
    // check password
    const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    if (this.walletService.checkWalletPasswordHash(this.walletPassword, walletObject.walletUUID, walletObject.passwordHash)) {
      // decrypt secret
      const cscCrypto = new CSCCrypto(this.walletPassword, this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail);
      const accountKey = this.walletService.getKey(this.walletService.selectedTableAccount.AccountID);
      this.logger.debug('### TokenList - doShowAccountSecret: ' + accountKey.accountID);
      this.accountSecret = cscCrypto.decrypt(accountKey.secret);
      this.showSecret = true;
      this.walletPassword = '';
    } else {
      this.error_message = 'You entered the wrong wallet password!';
      this.showSecretDialog = false;
      this.walletPassword = '';
      this.accountSecret = '';
      this.showErrorDialog = true;
    }
  }

  copySecret() {
    this.logger.debug('### TokenList - copySecret()');
    this.electronService.clipboard.writeText(this.accountSecret);
    this.copyIcon = 'pi pi-check';
    const finishTimer = timer(1000);
    finishTimer.subscribe(val =>  {
      this.copyIcon = 'fa fa-copy';
    });
  }

  onHideSecretDialog() {
    this.logger.debug('### TokenList - onHideSecretDialog()');
    this.accountSecret = '';
    this.showSecretDialog = false;
  }

  doShowEditAccountLabel() {
    this.logger.debug('### TokenList - showEditAccountLabel: ' + this.walletService.selectedTableAccount.AccountLabel);
    this.accountLabel = this.walletService.selectedTableAccount.AccountLabel;
    this.showEditAccountLabel = true;
  }

  doSaveAccountLabel() {
    const account: LokiAccount = this.walletService.getAccount(this.walletService.selectedTableAccount.Token, this.walletService.selectedTableAccount.AccountID);
    account.label = this.accountLabel;
    this.walletService.updateAccount(account);
    // refresh token list
    this.casinocoinService.refreshAccountTokenList().subscribe( refreshResult => {
      if (refreshResult) {
        this.tokenlist = this.casinocoinService.tokenlist;
      }
    });
    this.showEditAccountLabel = false;
  }

  doShowAddToken() {
    this.logger.debug('### TokenList - doShowAddToken() ###');
    this.selectedCSCAccount = null;
    this.availableTokenlist = [];
    this.addTokenAccountSelected = false;
    this.showAddTokenDialog = true;
  }

  doShowAddCSC() {
    this.logger.debug('### TokenList - doShowAddCSC() ###');
    this.showAddCSCDialog = true;
  }

  onHideTokenDialog() {
    this.addToken = null;
    this.walletPassword = '';
    this.addIcon = 'fa fa-plus';
    this.showAddTokenDialog = false;
  }

  onHideCSCDialog() {
    this.walletPassword = '';
    this.addIcon = 'fa fa-plus';
    this.showAddCSCDialog = false;
  }

  convertCscTimestamp(inputTime) {
    return CSCUtil.casinocoinToUnixTimestamp(inputTime);
  }

  onRowSelect(event) {
    this.logger.debug('### onRowSelect: ' + JSON.stringify(event));
    if (this.currentToken === undefined) {
      this.currentToken = event;
    } else if (event.PK !== this.currentToken.PK) {
      this.logger.debug('### onRowSelect - reset sendForm');
      this.currentToken = event;
      this.sendForm.reset();
    }
  }

  canActivateAccount() {
    return this.casinocoinService.canActivateAccount();
  }

  doActivateAccount(token, password) {
    this.logger.debug('### onActivateAccount: ' + JSON.stringify(token) + ' password: ' + password);
    // generate new token account
    const userEmail = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail;
    const newAccountSequence = this.walletService.getAccountsMaxSequence() + 1;
    this.logger.debug('### newAccountSequence: ' + newAccountSequence);
    const cscCrypto = new CSCCrypto(password, userEmail);
    const decryptedMnemonicHash = cscCrypto.decrypt(this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).mnemonicHash);
    cscCrypto.setPasswordKey(decryptedMnemonicHash);
    const newKeyPair: LokiKey = cscCrypto.generateKeyPair(newAccountSequence);
    this.logger.debug('### newKeyPair: ' + JSON.stringify(newKeyPair));
    // save key to wallet
    this.walletService.addKey(newKeyPair);
    // encrypt key
    this.walletService.encryptAllKeys(password, userEmail).subscribe( result => {
      if (result === AppConstants.KEY_FINISHED) {
        // create new account
        const walletAccount: LokiAccount = {
            pk: (token.Token + newKeyPair.accountID),
            accountID: newKeyPair.accountID,
            balance: '0',
            accountSequence: newAccountSequence,
            currency: token.Token,
            tokenBalance: '0',
            lastSequence: 0,
            label: token.FullName,
            activated: false,
            ownerCount: 0,
            lastTxID: '',
            lastTxLedger: 0
        };
        // save account to wallet
        this.walletService.addAccount(walletAccount);
        this.logger.debug('### Activate account: ' + walletAccount.accountID + ' with account: ' + this.mainCSCAccountID);
        // // get the account secret
        const cscAccountKey = this.walletService.getKey(this.mainCSCAccountID);
        const tokenAccountKey = this.walletService.getKey(walletAccount.accountID);
        // prepare, sign and send the transaction
        const instructions = { maxLedgerVersionOffset: 3, fee: this.fees };
        this.logger.debug('### Transaction Instructions: ' + JSON.stringify(instructions));
        // send the amount to activate the account
        const payment: any = {
          source: {
            address: this.mainCSCAccountID,
            maxAmount: { value: this.accountReserve, currency: 'CSC' }
          },
          destination: {
            address: walletAccount.accountID,
            amount: { value: this.accountReserve, currency: 'CSC' }
          }
        };
        this.logger.debug('### Transaction Payment: ' + JSON.stringify(payment));
        const secretsCSCCrypto = new CSCCrypto(password, userEmail);
        const cscDecryptedSecret = secretsCSCCrypto.decrypt(cscAccountKey.secret);
        const tokenDecryptedSecret = secretsCSCCrypto.decrypt(tokenAccountKey.secret);
        let txSignResult: string;
        this.casinocoinService.cscAPI.preparePayment(this.mainCSCAccountID, payment).then(prepared => {
          this.logger.debug('### Prepared: ' + JSON.stringify(prepared));
          return this.casinocoinService.cscAPI.sign(prepared.txJSON, cscDecryptedSecret);
        }).then( signResult => {
          this.logger.debug('### Sign Result: ' + JSON.stringify(signResult));
          txSignResult = signResult.id;
          return this.casinocoinService.cscAPI.submit(signResult.signedTransaction);
        }).then( submitResult => {
          this.logger.debug('### Submit Result: ' + JSON.stringify(submitResult));
          if (submitResult['resultCode'] === 'tesSUCCESS') {
            // account activated ... wait for validation
            this.casinocoinService.validatedTxSubject.subscribe( txHash => {
              if (txHash === txSignResult) {
                // validated ... now create the trustline to the issuer account
                this.logger.debug('### Activation tx hash: ' + txHash);
                const trustline = {
                  currency: token.Token,
                  counterparty: token.Issuer,
                  limit: token.TotalSupply
                };
                // set the main CSC account as public key for signing and sending transactions
                const settings = {
                  regularKey: this.mainCSCAccountID
                };
                this.casinocoinService.cscAPI.prepareSettings(walletAccount.accountID, settings).then( preparedSettings => {
                  this.logger.debug('### Settings Result: ' + JSON.stringify(preparedSettings));
                  return this.casinocoinService.cscAPI.sign(preparedSettings.txJSON, tokenDecryptedSecret);
                }).then( settingsSignResult => {
                  this.logger.debug('### Settings Sign Result: ' + JSON.stringify(settingsSignResult));
                  return this.casinocoinService.cscAPI.submit(settingsSignResult.signedTransaction);
                }).then( settingsSubmitResult => {
                  this.logger.debug('### Settings Submit Result: ' + JSON.stringify(settingsSubmitResult));
                  this.casinocoinService.cscAPI.prepareTrustline(walletAccount.accountID, trustline, instructions).then( preparedTrust => {
                  this.logger.debug('### Trustline Result: ' + JSON.stringify(preparedTrust));
                  return this.casinocoinService.cscAPI.sign(preparedTrust.txJSON, cscDecryptedSecret);
                }).then( trustSignResult => {
                  this.logger.debug('### Trustline Sign Result: ' + JSON.stringify(trustSignResult));
                  return this.casinocoinService.cscAPI.submit(trustSignResult.signedTransaction);
                }).then( trustSubmitResult => {
                  this.logger.debug('### Trustline Submit Result: ' + JSON.stringify(trustSubmitResult));
                    // refresh token list
                    this.casinocoinService.refreshAccountTokenList().subscribe( refreshResult => {
                      if (refreshResult) {
                        this.tokenlist = this.casinocoinService.tokenlist;
                      }
                    });
                    // reset addToken, password and close dialog
                    this.addToken = null;
                    this.walletPassword = '';
                    this.addIcon = 'fa fa-plus';
                    this.showAddTokenDialog = false;
                  });
                });
              }
            });
          } else if (submitResult['resultCode'] === 'tecPATH_DRY') {
            this.logger.debug('### Tokenlist: Not enough balance or destination can not receive this token');
            this.notificationService.addMessage({title: 'Payment Error', body: 'Your payment could not be executed due to insufficient balance or the destination can not receive your token payment.'});
          }
        });
      }
    });
  }

  addTokenToAccount(token, password, accountID) {
    const cscAccount: LokiAccount = this.walletService.getAccount('CSC', accountID);
    const userEmail = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail;
    // create new account
    const walletAccount: LokiAccount = {
      pk: (token.Token + cscAccount.accountID),
      accountID: cscAccount.accountID,
      balance: '0',
      accountSequence: cscAccount.accountSequence,
      currency: token.Token,
      tokenBalance: '0',
      lastSequence: cscAccount.lastSequence,
      label: token.FullName,
      activated: true,
      ownerCount: cscAccount.ownerCount,
      lastTxID: cscAccount.lastTxID,
      lastTxLedger: cscAccount.lastTxLedger
    };
    // save account to wallet
    this.walletService.addAccount(walletAccount);
    // get the account secret
    const cscAccountKey = this.walletService.getKey(cscAccount.accountID);
    const secretsCSCCrypto = new CSCCrypto(password, userEmail);
    const cscDecryptedSecret = secretsCSCCrypto.decrypt(cscAccountKey.secret);
    // define the trustline
    const trustline = {
      currency: token.Token,
      counterparty: token.Issuer,
      limit: token.TotalSupply
    };
    const instructions = { maxLedgerVersionOffset: 3, fee: this.fees };
    // create, sign and submit trusline tx
    this.casinocoinService.cscAPI.prepareTrustline(walletAccount.accountID, trustline, instructions).then( preparedTrust => {
      this.logger.debug('### Trustline Result: ' + JSON.stringify(preparedTrust));
      return this.casinocoinService.cscAPI.sign(preparedTrust.txJSON, cscDecryptedSecret);
    }).then( trustSignResult => {
      this.logger.debug('### Trustline Sign Result: ' + JSON.stringify(trustSignResult));
      return this.casinocoinService.cscAPI.submit(trustSignResult.signedTransaction);
    }).then( trustSubmitResult => {
      this.logger.debug('### Trustline Submit Result: ' + JSON.stringify(trustSubmitResult));
      // refresh token list
      this.casinocoinService.refreshAccountTokenList().subscribe( refreshResult => {
        if (refreshResult) {
          this.tokenlist = this.casinocoinService.tokenlist;
        }
      });
      // reset addToken, password and close dialog
      this.addToken = null;
      this.walletPassword = '';
      this.addIcon = 'fa fa-plus';
      this.showAddTokenDialog = false;
      this.footer_visible = false;
      this.error_message = '';
      this.renderer.selectRootElement('#float-input-password').value = '';
    });
  }

  addCSCAccount() {
    const userEmail = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail;
    const newAccountSequence = this.walletService.getAccountsMaxSequence() + 1;
    this.logger.debug('### newAccountSequence: ' + newAccountSequence);
    const cscCrypto = new CSCCrypto(this.walletPassword, userEmail);
    const decryptedMnemonicHash = cscCrypto.decrypt(this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).mnemonicHash);
    cscCrypto.setPasswordKey(decryptedMnemonicHash);
    const newKeyPair: LokiKey = cscCrypto.generateKeyPair(newAccountSequence);
    this.logger.debug('### newKeyPair: ' + JSON.stringify(newKeyPair));
    // save key to wallet
    this.walletService.addKey(newKeyPair);
    // encrypt key
    this.walletService.encryptAllKeys(this.walletPassword, userEmail).subscribe( result => {
      if (result === AppConstants.KEY_FINISHED) {
        // create new account
        const walletAccount: LokiAccount = {
            pk: ('CSC' + newKeyPair.accountID),
            accountID: newKeyPair.accountID,
            balance: '0',
            accountSequence: newAccountSequence,
            currency: 'CSC',
            tokenBalance: '0',
            lastSequence: 0,
            label: 'CSC Account',
            activated: false,
            ownerCount: 0,
            lastTxID: '',
            lastTxLedger: 0
        };
        // save account to wallet
        this.walletService.addAccount(walletAccount);
        this.logger.debug('### Added new WalletAccount: ' + JSON.stringify(walletAccount));
        // refresh token list
        this.casinocoinService.refreshAccountTokenList().subscribe( refreshResult => {
          if (refreshResult) {
            this.tokenlist = this.casinocoinService.tokenlist;
          }
        });
        // subcribe to all accounts again
        this.casinocoinService.subscribeAccountEvents();
        // refresh all CSC accounts for add token dropdown
        this.cscAccounts = [];
        this.walletService.getAllAccounts().forEach( element => {
          if (element.currency === 'CSC' && new Big(element.balance) > 0) {
            const accountLabel = element.accountID.substring(0, 20) + '...' + ' [Balance: ' +
                                this.cscAmountPipe.transform(element.balance, false, true) + ']';
            this.cscAccounts.push({label: accountLabel, value: element.accountID});
          }
        });
        // reset password and close dialog
        this.walletPassword = '';
        this.addIcon = 'fa fa-plus';
        this.showAddCSCDialog = false;
      }
    });
  }

  onSendFormSubmit(value) {
    this.logger.debug('### onSendFormSubmit: ' + JSON.stringify(value));
    // check password
    const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    if (this.walletService.checkWalletPasswordHash(value.password, walletObject.walletUUID, walletObject.passwordHash)) {
      // check the destination account id
      if (this.casinocoinService.cscAPI.isValidAddress(value.accountid.trim())) {
        if (!isNaN(value.amount)) {
          // get the account secret for the CSC account
          const accountKey = this.walletService.getKey(this.currentToken.AccountID);
          this.logger.debug('### send accountID: ' + JSON.stringify(this.currentToken));
          this.logger.debug('### send accountKey: ' + JSON.stringify(accountKey));
          // prepare, sign and send the transaction
          const instructions = { maxLedgerVersionOffset: 5, fee: this.fees };
          const payment: any = {
            source: {
              address: this.currentToken.AccountID,
              maxAmount: { value: value.amount, currency: this.currentToken.Token }
            },
            destination: {
              address: value.accountid.trim(),
              amount: { value: value.amount, currency: this.currentToken.Token }
            },
            allowPartialPayment: false
          };
          if (this.currentToken.Token !== 'CSC') {
            payment.source.maxAmount['counterparty'] = this.currentToken.Issuer;
            payment.destination.amount['counterparty'] = this.currentToken.Issuer;
          }
          // add destination tag if present
          if (value.destinationtag > 0) {
            payment.destination.tag = value.destinationtag;
          }
          // add description if present
          if (value.description !== null && value.description.length > 0) {
            payment.memos = [{data: value.description, format: 'plain/text'}];
          }
          this.casinocoinService.cscAPI.preparePayment(this.currentToken.AccountID, payment, instructions).then(prepared => {
            this.logger.debug('### Prepared: ' + JSON.stringify(prepared));
            const cscCrypto = new CSCCrypto(value.password, this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).userEmail);
            const decryptedSecret = cscCrypto.decrypt(accountKey.secret);
            return this.casinocoinService.cscAPI.sign(prepared.txJSON, decryptedSecret);
          }).then( signResult => {
            this.logger.debug('### Sign Result: ' + JSON.stringify(signResult));
            return this.casinocoinService.cscAPI.submit(signResult.signedTransaction);
          }).then( submitResult => {
            this.logger.debug('### Submit Result: ' + JSON.stringify(submitResult));
            this.sendForm.reset();
          }).catch( error => {
            this.logger.debug('### ERROR: ' + JSON.stringify(error));
            this.error_message = error;
            this.sendForm.reset();
          });
        } else {
          this.error_message = 'Entered value for amount is not valid';
          this.showErrorDialog = true;
        }
      } else {
        this.error_message = 'Invalid destination AccountID';
        this.showErrorDialog = true;
      }
    } else {
      this.error_message = 'You entered the wrong wallet password!';
      this.showErrorDialog = true;
      this.renderer.selectRootElement('#float-input-password').value = '';
      this.renderer.selectRootElement('#float-input-password').focus();
    }
  }

  availableBalanceCSC() {
    const cscAccount: LokiAccount = this.walletService.getTokenAccount('CSC');
    this.logger.debug('### CSC Balance: ' + cscAccount.balance);
    this.logger.debug('### Account Reserve: ' + this.accountReserve);
    // const available = new Big(balance).minus(new Big(this.accountReserve));
    // return available.toString();
    return cscAccount.balance;
  }

  onTokenRowSelect(event) {
    this.logger.debug('### onTokenRowSelect: ' + JSON.stringify(event));
    this.addToken = event;
  }

  doAddToken() {
    this.logger.debug('### doAddToken: ' + this.addToken.Token + ' for: ' + this.selectedCSCAccount);
    const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    if (this.walletService.checkWalletPasswordHash(this.walletPassword, walletObject.walletUUID, walletObject.passwordHash)) {
      this.addIcon = 'pi fa-spin pi-spinner';
      this.addTokenToAccount(this.addToken, this.walletPassword, this.selectedCSCAccount);
    } else {
      this.footer_visible = true;
      this.error_message = 'You entered the wrong wallet password!';
      this.addIcon = 'fa fa-plus';
      this.renderer.selectRootElement('#float-input-password').value = '';
      this.renderer.selectRootElement('#float-input-password').focus();
    }
  }

  doAddCSCAccount() {
    this.logger.debug('### doAddCSCAccount ###');
    const walletObject: WalletDefinition = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET);
    if (this.walletService.checkWalletPasswordHash(this.walletPassword, walletObject.walletUUID, walletObject.passwordHash)) {
      this.addIcon = 'pi fa-spin pi-spinner';
      this.addCSCAccount();
    } else {
      this.footer_visible = true;
      this.error_message = 'You entered the wrong wallet password!';
      this.addIcon = 'fa fa-plus';
      this.renderer.selectRootElement('#float-input-password').value = '';
      this.renderer.selectRootElement('#float-input-password').focus();
    }
  }

  getCSCAccountInfo() {
    this.logger.debug('### getCSCAccountInfo: ' + this.selectedCSCAccount);
    this.casinocoinService.refreshAvailableTokenList().subscribe( availableFinished => {
      if (availableFinished) {
        this.availableTokenlist = [];
        // add all tokens to initial list
        this.casinocoinService.availableTokenList.forEach( token => {
          // only add tokens not yet in our wallet for selected account
          const accountsForTokens: Array<LokiAccount> = this.walletService.getAllTokenAccountsByAccountID(this.selectedCSCAccount);
          if (accountsForTokens.findIndex( item => item.currency === token.Token ) === -1) {
            this.availableTokenlist.push(token);
          }
        });
        this.addTokenAccountSelected = true;
      }
    });
  }

  doCloseError() {
    this.showErrorDialog = false;
    this.error_message = '';
  }

  getTotalReserved(rowData) {
    return Number(this.accountReserve) + (Number(rowData.OwnerCount) *  Number(this.reserveIncrement));
  }

  doSendAll(rowData) {
    this.logger.debug('### TokenList - doSendAll: ' + JSON.stringify(rowData));
    // if CSC we need to deduce reserves and fees for the tx, for tokens we can send all
    if (rowData.Token === 'CSC') {
      const sendMax = Number(CSCUtil.dropsToCsc(rowData.Balance)) - this.getTotalReserved(rowData) - Number(this.fees);
      this.sendForm.controls.amount.setValue(sendMax.toString());
    } else {
      this.sendForm.controls.amount.setValue(CSCUtil.dropsToCsc(rowData.TokenBalance));
    }
  }

  getSendFormDisabled(rowData) {
    const reserved = Number(this.accountReserve) + (Number(rowData.OwnerCount) *  Number(this.reserveIncrement)) + Number(this.fees);
    return (Number(CSCUtil.cscToDrops(reserved.toString())) > Number(rowData.Balance));
  }

  onExpandedRowClicked(rowData) {
    this.walletService.selectedTableAccount = rowData;
    this.currentToken = rowData;
  }
}
