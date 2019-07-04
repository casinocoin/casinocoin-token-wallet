import { Injectable, OnInit, OnDestroy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Observable, BehaviorSubject, Subscription, Subject, from } from 'rxjs';
import { WalletService } from './wallet.service';
import { LocalStorageService, SessionStorageService } from 'ngx-store';
import { LogService } from './log.service';
import { LokiKey, LokiAccount, LokiTransaction, LokiTxStatus } from '../domains/lokijs';
import { AppConstants } from '../domains/app-constants';
import { NotificationService } from './notification.service';
import { ElectronService } from './electron.service';
import { CasinocoinAPI } from '@casinocoin/libjs';
import { LedgerStreamMessages, TokenType } from '../domains/csc-types';
import { CSCCrypto } from '../domains/csc-crypto';
import { CSCUtil } from '../domains/csc-util';
import { ServerDefinition } from '../domains/csc-types';
import Big from 'big.js';
import { GetServerInfoResponse } from '@casinocoin/libjs/common/serverinfo';

@Injectable()
export class CasinocoinService implements OnDestroy {

    private defaultMinimalFee = 100000;

    public cscAPI: CasinocoinAPI;
    public accounts: Array<LokiAccount> = [];
    public accountSubject = new Subject<LokiAccount>();
    public transactions: Array<LokiTransaction> = [];
    public transactionSubject = new Subject<LokiTransaction>();
    public lastTransactionHash: string;
    public connectSubject = new BehaviorSubject<string>(AppConstants.KEY_INIT);
    public ledgers: Array<LedgerStreamMessages> = [];
    public ledgerSubject = new Subject<LedgerStreamMessages>();
    public tokenlist: TokenType[] = [];
    public serverInfo: GetServerInfoResponse;
    public validatedTxSubject = new Subject<string>();
    public availableServerList: Array<ServerDefinition> = [];
    public connectToProduction: boolean;
    public availableTokenList: TokenType[] = [];
    public availableTokenListSubject = new BehaviorSubject<boolean>(false);

    constructor(private logger: LogService,
                private walletService: WalletService,
                private notificationService: NotificationService,
                private decimalPipe: DecimalPipe,
                private localStorageService: LocalStorageService,
                private sessionStorageService: SessionStorageService,
                private electron: ElectronService ) {
        logger.debug('### INIT  CasinocoinService ###');
        this.connectToProduction = this.localStorageService.get(AppConstants.KEY_PRODUCTION_NETWORK);
    }

    ngOnDestroy() {
        this.logger.debug('### CasinocoinService onDestroy ###');
    }

    connect(): Observable<any> {
        this.logger.debug('### CasinocoinService Connect()');
        this.logger.debug('### CasinocoinService Connect() - Connect To Production?: ' + this.connectToProduction);

        // define server connection if not yet defined
        if (this.cscAPI === undefined) {
            this.logger.debug('### Define API connection for CasinocoinAPI');
            this.cscAPI = new CasinocoinAPI({ server: 'ws://wst02.casinocoin.org:7007' });
        }
        this.logger.debug('### CasinocoinService Connect() - isConnected?: ' + this.cscAPI.isConnected());
        if (!this.cscAPI.isConnected()) {
            // connect to server
            this.logger.debug('### CasinocoinService call API.connect()');
            this.cscAPI.connect().then(() => {
                // get server info
                this.cscAPI.getServerInfo().then(info => {
                    this.logger.debug('### CasinocoinService Connect() - Server: ' + JSON.stringify(info, null, 2));
                    this.serverInfo = info;
                    // inform listeners we are connected
                    this.connectSubject.next(AppConstants.KEY_CONNECTED);
                    // get ledger info
                    this.cscAPI.getLedger().then( ledger => {
                        this.logger.debug('### CasinocoinService Connect() - Ledger: ' + JSON.stringify(ledger, null, 2));
                        const ledgerMessage: LedgerStreamMessages = {
                            fee_base: Number(CSCUtil.cscToDrops(info.validatedLedger.baseFeeCSC)),
                            fee_ref: 0,
                            ledger_index: ledger.ledgerVersion,
                            ledger_time: CSCUtil.iso8601ToCasinocoinTime(ledger.closeTime),
                            txn_count: 0,
                            ledger_hash: ledger.ledgerHash,
                            reserve_base: Number(CSCUtil.cscToDrops(info.validatedLedger.reserveBaseCSC)),
                            reserve_inc: 0,
                            validated_ledgers: info.completeLedgers
                        };
                        this.ledgers.splice(0, 0, ledgerMessage);
                    });
                });
                // subscribe to account events
                this.subscribeAccountEvents();
                // handle CSC blockchain events
                this.cscAPI.on('ledger', ledger => {
                    this.logger.debug('### CasinocoinService.ledger: ' + JSON.stringify(ledger, null, 2));
                    // we received a ledger
                    const ledgerMessage: LedgerStreamMessages = {
                        fee_base: Number(CSCUtil.cscToDrops(ledger.baseFeeCSC)),
                        fee_ref: 0,
                        ledger_index: ledger.ledgerVersion,
                        ledger_time: CSCUtil.iso8601ToCasinocoinTime(ledger.ledgerTimestamp),
                        txn_count: ledger.transactionCount,
                        ledger_hash: ledger.ledgerHash,
                        reserve_base: Number(CSCUtil.cscToDrops(ledger.reserveBaseCSC)),
                        reserve_inc: 0,
                        validated_ledgers: ledger.ledgerVersion
                    };
                    this.ledgers.splice(0, 0, ledgerMessage);
                    this.ledgerSubject.next(ledger);
                    this.serverInfo.validatedLedger.baseFeeCSC = ledger.baseFeeCSC;
                    this.serverInfo.validatedLedger.reserveBaseCSC = ledger.reserveBaseCSC;
                });
                this.cscAPI.on('transaction', tx => {
                    this.logger.debug('### CasinocoinService.transaction: '  + JSON.stringify(tx, null, 2));
                    const msg_tx = tx['transaction'];
                    if (msg_tx.TransactionType === 'Payment') {
                        this.handlePayment(tx);
                    } else if (msg_tx.TransactionType === 'SetCRNRound') {
                        this.handleCRNRound(msg_tx, tx['meta']);
                    } else if (msg_tx.TransactionType === 'TrustSet') {
                        this.handleTrustline(tx);
                    }
                    // raise event if tx is validated
                    if (tx.validated) {
                        this.validatedTxSubject.next(tx.transaction.hash);
                    }
                });
                this.cscAPI.on('disconnected', code => {
                    this.logger.debug('### CasinocoinService.disconnected: ' + JSON.stringify(code));
                });
            }).catch(error => {
                console.log(JSON.stringify(error));
            });
        } else {
            this.connectSubject.next(AppConstants.KEY_CONNECTED);
        }
        // return observable with incomming message
        return this.connectSubject.asObservable();
    }

    disconnect() {
        this.logger.debug('### CasinocoinService - disconnect');
        // disconnect from the network if connected
        if (this.cscAPI && this.cscAPI.isConnected()) {
            this.cscAPI.disconnect();
            this.connectSubject.next(AppConstants.KEY_INIT);
        }
    }

    isConnected() {
        if (this.cscAPI === undefined) {
            return false;
        } else {
            return this.cscAPI.isConnected;
        }
    }

    subscribeAccountEvents() {
        // get accounts and subscribe to accountstream
        const subscribeAccounts = [];
        // make sure the wallet is openend
        this.walletService.openWalletSubject.subscribe(result => {
            if (result === AppConstants.KEY_LOADED) {
                this.walletService.getAllKeys().forEach(element => {
                    subscribeAccounts.push(element.accountID);
                });
                this.logger.debug('### CasinocoinService Subscribe Accounts: ' + JSON.stringify(subscribeAccounts));
                // subsribe to all accounts
                this.subscribeAccounts(subscribeAccounts);
            }
        });
    }

    updateServerListItem(server: ServerDefinition) {
        const api = new CasinocoinAPI({ server: server.server_url });
        const startTime = Date.now();
        // connect to server
        this.logger.debug('### CasinocoinService - updateServerListItem - call API.connect()');
        api.connect().then(() => {
            // get server info
            api.getServerInfo().then(info => {
                this.logger.debug('### CasinocoinService - updateServerListItem: ' + JSON.stringify(info, null, 2));
                const responseTime = Date.now() - startTime;
                // save server info
                server.public_key = info.pubkeyNode;
                server.completeLedgers = info.completeLedgers;
                server.serverState = info.serverState;
                server.response_time = responseTime;
                // upsert item on list
                const serverListItemIndex = this.availableServerList.findIndex( item => item.server_id === server.server_id);
                this.logger.debug('### serverListItemIndex: ' + serverListItemIndex);
                if (serverListItemIndex < 0) {
                    // add server to the list
                    this.availableServerList.push(server);
                } else {
                    // update server on the list
                    this.availableServerList[serverListItemIndex] = server;
                }
                this.logger.debug('### availableServerList: ' + JSON.stringify(this.availableServerList));
                // disconnect
                api.disconnect();
            });
        }).catch( error => {
            this.logger.debug('### ### CasinocoinService - updateServerListItem - ERROR: ' + JSON.stringify(error));
            if (error.name === 'NotConnectedError') {
                server.response_time = -1;
                server.serverState = 'NotConnectedError';
                // upsert item on list
                const serverListItemIndex = this.availableServerList.findIndex( item => item.server_id === server.server_id);
                this.logger.debug('### serverListItemIndex: ' + serverListItemIndex);
                if (serverListItemIndex < 0) {
                    // add server to the list
                    this.availableServerList.push(server);
                } else {
                    // update server on the list
                    this.availableServerList[serverListItemIndex] = server;
                }
            }
        });
    }

    updateServerList() {
        if (this.connectToProduction) {
            this.updateServerListItem(
                { server_id: 'ws01.casinocoin.org',
                  server_url: 'wss://ws01.casinocoin.org:4443/',
                  server_name: 'Foundation Wallet Server 1'
                }
            );
            this.updateServerListItem(
                { server_id: 'ws02.casinocoin.org',
                  server_url: 'wss://ws02.casinocoin.org:4443/',
                  server_name: 'Foundation Wallet Server 2'
                }
            );
        } else {
            this.updateServerListItem(
                { server_id: 'wst01.casinocoin.org',
                  server_url: 'wss://wst01.casinocoin.org:4443/',
                  server_name: 'Foundation TEST Wallet Server 1'
                }
            );
            this.updateServerListItem(
                { server_id: 'wst02.casinocoin.org',
                  server_url: 'ws://wst02.casinocoin.org:7006/',
                  server_name: 'Foundation TEST Wallet Server 2'
                }
            );
        }
    }

    subscribeAccounts(accountArray: Array<string>) {
        this.connectSubject.subscribe( connectResult => {
            if (connectResult === AppConstants.KEY_CONNECTED) {
                this.cscAPI.connection.request({ id: 'AccountUpdates', command: 'subscribe', accounts: accountArray}).then( result => {
                    this.logger.debug('### CasinocoinService AccountUpdates Subscribe result: ' + JSON.stringify(result));
                });
            }
        });
    }

    refreshAvailableTokenList(): Observable<any> {
        this.connectSubject.subscribe( connectResult => {
            if (connectResult === AppConstants.KEY_CONNECTED) {
                this.logger.debug('### CasinocoinService -> getConfigInfo');
                // get current token list
                this.cscAPI.getConfigInfo('Token').then( configResult => {
                    this.availableTokenList = [];
                    configResult.forEach( token => {
                        // check if token is issued
                        this.cscAPI.getBalanceSheet(token.ConfigData['Issuer']).then(balances => {
                            if (balances.obligations && balances.obligations.length > 0) {
                                this.logger.debug('### CasinocoinService -> refreshAvailableTokenList -> Add Token: ' + token.ConfigData['Token']);
                                const listItem: any = {};
                                listItem.ApiEndpoint = token.ConfigData['ApiEndpoint'];
                                listItem.ContactEmail = token.ConfigData['ContactEmail'];
                                listItem.Flags = token.ConfigData['Flags'];
                                listItem.FullName = token.ConfigData['FullName'];
                                listItem.IconURL = token.ConfigData['IconURL'];
                                listItem.Issuer = token.ConfigData['Issuer'];
                                listItem.Token = token.ConfigData['Token'];
                                listItem.TotalSupply = token.ConfigData['TotalSupply'];
                                listItem.Website = token.ConfigData['Website'];
                                listItem.CoinValue = '0.001';
                                this.availableTokenList.push(listItem);
                                this.availableTokenListSubject.next(true);
                            }
                        });
                    });
                });
            }
        });
        return this.availableTokenListSubject.asObservable();
    }

    getTokenInfo(token: string): TokenType {
        return this.availableTokenList.find( item => item.Token === token);
    }

    refreshAccountTokenList(): Observable<any> {
        const tokenListSubject = new BehaviorSubject<boolean>(false);
        this.connectSubject.subscribe( connectResult => {
            if (connectResult === AppConstants.KEY_CONNECTED) {
                this.logger.debug('### CasinocoinService -> refreshAccountTokenList()');
                // get current token list
                this.cscAPI.getConfigInfo('Token').then( configResult => {
                    this.logger.debug('### CasinocoinService ConfigInfo Token: ' + JSON.stringify(configResult));
                    // make sure the wallet is openend
                    this.walletService.openWalletSubject.subscribe(result => {
                        if (result === AppConstants.KEY_LOADED) {
                            this.tokenlist = [];
                            // loop over accounts and add token info
                            const accountList: Array<LokiAccount> = this.walletService.getAllAccounts();
                            accountList.forEach( account => {
                                this.logger.debug('### CasinocoinService Account: ' + JSON.stringify(account));
                                // check if CSC account
                                if (account.currency === 'CSC') {
                                    const cscToken: TokenType = {
                                        PK: 'CSC' + account.accountID,
                                        AccountID: account.accountID,
                                        Activated: account.activated,
                                        ApiEndpoint: 'https://api.casincoin.org',
                                        Balance: account.balance,
                                        TokenBalance: '0',
                                        CoinValue: '0.0002',
                                        ContactEmail: 'info@casinocoin.org',
                                        Flags: 0,
                                        FullName: 'CasinoCoin',
                                        IconURL: 'https://github.com/casinocoin/CasinoCoin-Assets/raw/master/v4/casinocoin-icon-256x256.png',
                                        Issuer: '',
                                        Token: 'CSC',
                                        TotalSupply: '40000000000',
                                        Website: 'https://casinocoin.org'
                                    };
                                    this.tokenlist.push(cscToken);
                                } else {
                                    // search token in config
                                    configResult.forEach( token => {
                                        if (token.ConfigData['Token'] === account.currency) {
                                            const listItem: any = {};
                                            listItem.PK = token.ConfigData['Token'] + account.accountID;
                                            listItem.ApiEndpoint = token.ConfigData['ApiEndpoint'];
                                            listItem.ContactEmail = token.ConfigData['ContactEmail'];
                                            listItem.Flags = token.ConfigData['Flags'];
                                            listItem.FullName = token.ConfigData['FullName'];
                                            listItem.IconURL = token.ConfigData['IconURL'];
                                            listItem.Issuer = token.ConfigData['Issuer'];
                                            listItem.Token = token.ConfigData['Token'];
                                            listItem.TotalSupply = token.ConfigData['TotalSupply'];
                                            listItem.Website = token.ConfigData['Website'];
                                            listItem.AccountID = account.accountID;
                                            listItem.Activated = account.activated;
                                            listItem.Balance = account.balance;
                                            listItem.TokenBalance = account.tokenBalance;
                                            listItem.CoinValue = '0.001';
                                            this.tokenlist.push(listItem);
                                        }
                                    });
                                }
                                this.updateAccountInfo(account.currency, account.accountID);
                            });
                            // set refresh finished
                            tokenListSubject.next(true);
                        }
                    });
                });
            }
        });
        return tokenListSubject.asObservable();
    }

    addTxToWallet(tx, validated, inLedger, currency): LokiTransaction {
        this.logger.debug('### CasinocoinService - addTxToWallet');
        let txDirection: string;
        if (this.walletService.isAccountMine(tx.Destination)) {
            txDirection = AppConstants.KEY_WALLET_TX_IN;
            if (this.walletService.isAccountMine(tx.Account)) {
                txDirection = AppConstants.KEY_WALLET_TX_BOTH;
            }
        } else if (this.walletService.isAccountMine(tx.Account)) {
            txDirection = AppConstants.KEY_WALLET_TX_OUT;
        }
        // create new transaction object
        const dbTX: LokiTransaction = {
            accountID: tx.Account,
            amount: typeof tx.Amount === 'string' ? tx.Amount : CSCUtil.cscToDrops(tx.Amount.value),
            currency: currency,
            destination: tx.Destination,
            fee: tx.Fee,
            flags: tx.Flags,
            lastLedgerSequence: tx.LastLedgerSequence,
            sequence: tx.Sequence,
            signingPubKey: tx.SigningPubKey,
            timestamp: tx.date,
            transactionType: tx.TransactionType,
            txID: tx.hash,
            txnSignature: tx.TxnSignature,
            direction: txDirection,
            validated: validated,
            status: LokiTxStatus.received,
            inLedger: inLedger
        };
        // add Memos if defined
        if (tx.Memos) {
            dbTX.memos = CSCUtil.decodeMemos(tx.Memos);
        }
        // add Destination Tag if defined
        if (tx.DestinationTag) {
            dbTX.destinationTag = tx.DestinationTag;
        }
        // add Invoice ID if defined
        if (tx.InvoiceID && tx.InvoiceID.length > 0) {
            dbTX.invoiceID = CSCUtil.decodeInvoiceID(tx.InvoiceID);
        }
        // insert into the wallet
        this.walletService.addTransaction(dbTX);
        return dbTX;
    }

    handlePayment(tx) {
        this.logger.debug('### CasinocoinService - handlePayment: ' + JSON.stringify(tx));
        if (tx.engine_result === 'tesSUCCESS') {
            // check if csc or token
            this.logger.debug('### tx amount type: ' + typeof tx.transaction.Amount);
            const currency = typeof tx.transaction.Amount === 'string' ? 'CSC' : tx.transaction.Amount.currency;
            // check if we already have the TX
            let dbTX: LokiTransaction = this.walletService.getTransaction(tx.transaction.hash);
            if (dbTX == null) {
                dbTX = this.addTxToWallet(tx.transaction, tx.validated, tx.ledger_index, currency);
            } else {
                // update transaction object
                dbTX.timestamp = tx.transaction.date;
                dbTX.status = LokiTxStatus.received;
                dbTX.validated = tx.validated;
                dbTX.inLedger = tx.ledger_index;
                dbTX.engineResult = tx.engine_result;
                dbTX.engineResultMessage = tx.engine_result_message;
                // update into the wallet
                this.walletService.updateTransaction(dbTX);
            }
            // notify tx change
            this.transactionSubject.next(dbTX);
            // update accounts
            let amountString: string;
            if (currency !== 'CSC') {
                amountString = tx.transaction.Amount.value;
            } else {
                amountString = CSCUtil.dropsToCsc(tx.transaction.Amount);
            }
            if (dbTX.direction === AppConstants.KEY_WALLET_TX_IN) {
                this.updateAccountInfo(currency, dbTX.destination);
                this.notificationService.addMessage(
                    {title: 'Incoming Transaction',
                    body: 'You received ' + this.decimalPipe.transform(amountString, '1.2-8') +
                    ' ' + currency + ' from ' + dbTX.accountID});
            } else if (dbTX.direction === AppConstants.KEY_WALLET_TX_OUT) {
                this.updateAccountInfo(currency, dbTX.accountID);
                this.notificationService.addMessage(
                    {title: 'Outgoing Transaction', body: 'You sent ' +
                    this.decimalPipe.transform(amountString, '1.2-8') +
                    ' ' + currency + ' to ' + dbTX.destination});
            } else {
                this.updateAccountInfo(currency, dbTX.destination);
                this.updateAccountInfo(currency, dbTX.accountID);
                this.notificationService.addMessage(
                    {title: 'Wallet Transaction',
                    body: 'You sent ' + this.decimalPipe.transform(amountString, '1.2-8') +
                        ' ' + currency + ' to your own address ' + dbTX.destination});
            }
        } else {
            this.notificationService.addMessage(
                {title: 'Payment Transaction Error', body: tx.engine_result_message });
        }
    }

    handleCRNRound(tx, meta) {
        // check if we already have the TX
        let dbTX: LokiTransaction = this.walletService.getTransaction(tx.hash);
        // this.logger.debug("### CasinocoinService - handleCRNRound tx: " + JSON.stringify(tx) + " meta: " + JSON.stringify(meta));
        // this.logger.debug("### CasinocoinService - handleCRNRound dbTX: " + JSON.stringify(dbTX));
        if (dbTX == null) {
            // check if the destination account is ours
            meta['AffectedNodes'].forEach(node => {
                if (node.ModifiedNode !== undefined && node.ModifiedNode.LedgerEntryType === 'AccountRoot') {
                    this.logger.debug('### CasinocoinService - handleCRNRound node: ' + JSON.stringify(node));
                    if (this.walletService.isAccountMine(node.ModifiedNode.FinalFields.Account)) {
                        this.logger.debug('### CasinocoinService - Account is mine: ' + node.ModifiedNode.FinalFields.Account);
                        // calculate amount
                        let txAmount: Big = new Big(node.ModifiedNode.FinalFields.Balance);
                        txAmount = txAmount.minus(node.ModifiedNode.PreviousFields.Balance);
                        // create new transaction object
                        dbTX = {
                            accountID: tx.Account,
                            amount: txAmount.toString(),
                            currency: 'CSC',
                            destination: node.ModifiedNode.FinalFields.Account,
                            fee: tx.Fee,
                            flags: 0,
                            lastLedgerSequence: tx.LedgerSequence,
                            sequence: node.ModifiedNode.FinalFields.Sequence,
                            signingPubKey: '',
                            timestamp: tx.date,
                            transactionType: tx.TransactionType,
                            txID: tx.hash,
                            txnSignature: '',
                            direction: AppConstants.KEY_WALLET_TX_IN,
                            validated: true,
                            status: LokiTxStatus.received,
                            inLedger: tx.LedgerSequence
                        };
                        // insert into the wallet
                        this.walletService.addTransaction(dbTX);
                        this.logger.debug('### CasinocoinService - dbTX: ' + JSON.stringify(dbTX));
                        // notify tx change
                        this.transactionSubject.next(dbTX);
                        // update accounts
                        this.updateAccountInfo('CSC', dbTX.destination);
                        this.notificationService.addMessage(
                            {title: 'Incoming CRN Fee Transaction',
                            body: 'You received ' + this.decimalPipe.transform(CSCUtil.dropsToCsc(dbTX.amount), '1.2-8') +
                                ' coins for CRN Ledger Round ' + dbTX.lastLedgerSequence});
                    } else {
                        this.logger.debug('### CasinocoinService - Account NOT mine: ' + node.ModifiedNode.FinalFields.Account);
                    }
                } else {
                    this.logger.debug('### CasinocoinService - node.ModifiedNode undefined');
                }
            });
        } else {
            // update transaction object
            dbTX.timestamp = tx.date;
            dbTX.status = LokiTxStatus.received;
            // update into the wallet
            this.walletService.updateTransaction(dbTX);
        }
    }

    handleTrustline(tx) {
        this.logger.debug('### CasinocoinService - handleTrustline: ' + JSON.stringify(tx));
        // update CSC account
        const accountID = tx.transaction.Account;
        const cscAccount: LokiAccount = this.walletService.getAccount('CSC', accountID);
        // loop over affected nodes
        let resultUpdated = false;
        tx.meta.AffectedNodes.forEach(node => {
            if (!resultUpdated) {
                if (node.ModifiedNode !== undefined &&
                    node.ModifiedNode.LedgerEntryType === 'AccountRoot' &&
                    node.ModifiedNode.FinalFields !== undefined) {
                        this.logger.debug('### CasinocoinService - handleTrustline node: ' + JSON.stringify(node));
                        cscAccount.balance = node.ModifiedNode.FinalFields.Balance;
                        cscAccount.lastSequence = node.ModifiedNode.FinalFields.Sequence;
                        cscAccount.ownerCount = node.ModifiedNode.FinalFields.OwnerCount;
                        cscAccount.lastTxID = tx.transaction.hash;
                        cscAccount.lastTxLedger = tx.ledger_index;
                        resultUpdated = true;
                }
            }
        });
        // save back to the wallet
        this.walletService.updateAccount(cscAccount);
        this.updateToken(cscAccount);
        // update token account
        const tokenAccount: LokiAccount = this.walletService.getAccount(tx.transaction.LimitAmount.currency, accountID);
        // loop over affected nodes
        resultUpdated = false;
        tx.meta.AffectedNodes.forEach(node => {
            if (!resultUpdated) {
                if (node.ModifiedNode !== undefined &&
                    node.ModifiedNode.LedgerEntryType === 'AccountRoot' &&
                    node.ModifiedNode.FinalFields !== undefined) {
                        tokenAccount.lastSequence = node.ModifiedNode.FinalFields.Sequence;
                        tokenAccount.ownerCount = node.ModifiedNode.FinalFields.OwnerCount;
                        tokenAccount.lastTxID = tx.transaction.hash;
                        tokenAccount.lastTxLedger = tx.ledger_index;
                        resultUpdated = true;
                }
            }
        });
        // save back to the wallet
        this.walletService.updateAccount(tokenAccount);
        this.updateToken(tokenAccount);
        // emit account updated
        this.accountSubject.next(accountID);
    }

    updateAccountInfo(token: string, accountID: string) {
        this.logger.debug('### CasinocoinSerivce - updateAccountInfo: ' + token + '/' + accountID);
        // get the account from the wallet
        const walletAccount: LokiAccount = this.walletService.getAccount(token, accountID);
        let mainAccountInfo;
        this.cscAPI.getAccountInfo(accountID).then( accountInfo => {
            this.logger.debug('### CasinocoinSerivce - accountInfo: ' + JSON.stringify(accountInfo));
            mainAccountInfo = accountInfo;
            // update the info and CSC balance
            if (new Big(accountInfo.cscBalance).gt(Big(0))) {
                walletAccount.activated = true;
            } else {
                walletAccount.activated = false;
            }
            walletAccount.balance = CSCUtil.cscToDrops(accountInfo.cscBalance);
            walletAccount.lastSequence = accountInfo.sequence;
            walletAccount.lastTxID = accountInfo.previousAffectingTransactionID;
            walletAccount.lastTxLedger = accountInfo.previousAffectingTransactionLedgerVersion;
            // if it was a token account update we need to update the CSC account as well in case fees changed the balance
            const cscWalletAccount: LokiAccount = this.walletService.getAccount('CSC', accountID);
            if (new Big(accountInfo.cscBalance).gt(Big(0))) {
                cscWalletAccount.activated = true;
            } else {
                cscWalletAccount.activated = false;
            }
            cscWalletAccount.balance = CSCUtil.cscToDrops(accountInfo.cscBalance);
            cscWalletAccount.lastSequence = accountInfo.sequence;
            cscWalletAccount.lastTxID = accountInfo.previousAffectingTransactionID;
            cscWalletAccount.lastTxLedger = accountInfo.previousAffectingTransactionLedgerVersion;
            // save back to the wallet
            this.walletService.updateAccount(cscWalletAccount);
            // update token list
            this.updateToken(cscWalletAccount);
            // get the trustlines information
            return this.cscAPI.getTrustlines(accountID);
        }).then( trustLines => {
            this.logger.debug('### CasinocoinSerivce - trustLines: ' + JSON.stringify(trustLines));
            this.logger.debug('### CasinocoinSerivce - trustLines - mainAccountInfo: ' + JSON.stringify(mainAccountInfo));
            // update token balance if applicable
            trustLines.forEach(line => {
                if (line.specification.currency === token) {
                    walletAccount.tokenBalance = CSCUtil.cscToDrops(line.state.balance);
                }
            });
            // save back to the wallet
            this.walletService.updateAccount(walletAccount);
            // update token list
            this.updateToken(walletAccount);
            // update accounts array
            this.accounts = this.walletService.getAllAccounts();
            // emit account updated
            this.accountSubject.next(walletAccount);
        }).catch( error => {
            this.logger.debug('### updateAccountInfo - Error: ' + JSON.stringify(error));
        });
    }

    updateToken(account: LokiAccount) {
        // find token to update
        const tokenIndex: number = this.tokenlist.findIndex( item => (item.AccountID === account.accountID && item.Token === account.currency));
        const token: TokenType = this.tokenlist[tokenIndex];
        token.Balance = account.balance;
        token.TokenBalance = account.tokenBalance;
        if (account.currency === 'CSC') {
            if (new Big(token.Balance).gt(Big(0))) {
                token.Activated = true;
            } else {
                token.Activated = false;
            }
        }
        this.logger.debug('### CasinocoinService - updateToken: ' + JSON.stringify(token));
        this.tokenlist[tokenIndex] = token;
    }

    canActivateAccount(): boolean {
        let result = '';
        this.tokenlist.forEach( token => {
            if (token.Token === 'CSC' && result.length === 0) {
                // check if CSC balance is greater than 2 x reserve + current fees
                const requiredBalance = new Big(CSCUtil.cscToDrops(this.serverInfo.validatedLedger.reserveBaseCSC)).times(2);
                requiredBalance.plus(new Big(CSCUtil.cscToDrops(this.serverInfo.validatedLedger.baseFeeCSC)));
                if (new Big(token.Balance).gt(requiredBalance)) {
                    result = token.AccountID;
                }
            }
        });
        return (result.length > 0);
    }
}
