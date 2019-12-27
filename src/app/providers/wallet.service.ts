import { Injectable } from '@angular/core';
import { LogService } from './log.service';
import { Observable, BehaviorSubject, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { LocalStorageService, SessionStorageService } from 'ngx-store';
import { AppConstants } from '../domains/app-constants';
import { CSCUtil } from '../domains/csc-util';
import { CSCCrypto } from '../domains/csc-crypto';
import { ElectronService } from '../providers/electron.service';
import { NotificationService, SeverityType } from '../providers/notification.service';
import { CasinocoinAPI } from '@casinocoin/libjs';
import Big from 'big.js';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const LZString = require('lz-string');

import * as loki from 'lokijs';
import * as LokiIndexedAdapter from 'lokijs/src/loki-indexed-adapter';
import * as LokiTypes from '../domains/lokijs';
import { LokiKey } from '../domains/lokijs';
import { WalletSetup } from '../domains/csc-types';
import { sequence } from '@angular/animations';
import { DatePipe } from '@angular/common';

// const lfsa = require('../../../node_modules/lokijs/src/loki-fs-structured-adapter.js');
// import  LokiIndexedAdapter = require('../../../node_modules/lokijs/src/loki-indexed-adapter.js');
// const LokiCordovaFSAdapter = require('loki-cordova-fs-adapter');

@Injectable()
export class WalletService {

  private lokiAdapter;

  private walletDB;

  private accounts;
  private transactions;
  private addressbook;
  private keys;

  public isWalletOpen = false;
  public openWalletSubject = new BehaviorSubject<string>(AppConstants.KEY_INIT);
  public mnemonicSubject = new BehaviorSubject<string>('');

  public txCount: number = this.getWalletTxCount();
  public lastTx: LokiTypes.LokiTransaction = this.getWalletLastTx();

  public appVersionString: string;
  public walletPIN: string;
  public contactAccountID: string;
  public selectedTableAccount: any;

  public walletSetup = {} as WalletSetup;
  private cscOfflineAPI = new CasinocoinAPI();

  constructor(private logger: LogService,
              private datePipe: DatePipe,
              private localStorageService: LocalStorageService,
              private sessionStorageService: SessionStorageService,
              private electron: ElectronService,
              private notificationService: NotificationService) {
    this.logger.debug('### INIT WalletService ###');
   }

  createWallet(): Observable<any> {
    // create wallet for UUID
    this.logger.debug('### WalletService Create Wallet: ' + JSON.stringify(this.walletSetup.walletUUID));
    const userPath = this.electron.remote.app.getPath('home');
    if (this.walletSetup.walletLocation === undefined || this.walletSetup.walletLocation.length === 0) {
      this.walletSetup.walletLocation = path.join(userPath, '.casinocoin-wlt');
    }
    // check if path exists, else create
    this.logger.debug('### WalletService, check if wallet location exists');
    if (!fs.existsSync(this.walletSetup.walletLocation)) {
      this.logger.debug('### WalletService, location does not exist: ' + this.walletSetup.walletLocation);
      fs.mkdirSync(this.walletSetup.walletLocation);
    }
    const dbPath = path.join(this.walletSetup.walletLocation, (this.walletSetup.walletUUID + '.db'));
    this.logger.debug('### WalletService Database File: ' + dbPath);
    this.localStorageService.set(AppConstants.KEY_WALLET_LOCATION, dbPath);

    const collectionSubject = new Subject<any>();
    const createSubject = new Subject<any>();
    createSubject.subscribe(result => {
      if (result === AppConstants.KEY_FINISHED) {
        this.openWalletSubject.next(AppConstants.KEY_LOADED);
      }
    });

    collectionSubject.subscribe( collection => {
      this.logger.debug('### WalletService - collection: ' + JSON.stringify(collection));
      if (collection.name === 'accounts') {
        this.accounts = collection;
      } else if (collection.name === 'transactions') {
        this.transactions = collection;
      } else if (collection.name === 'keys') {
        this.keys = collection;
      } else if (collection.name === 'addressbook') {
        this.addressbook = collection;
      }
      this.isWalletOpen = true;
    });

    this.lokiAdapter = new LokiIndexedAdapter('casinocoin');
    const walletDB = new loki(dbPath,
      { adapter: this.lokiAdapter,
        autoloadCallback: createCollections,
        autoload: true,
        autosave: true,
        autosaveInterval: 5000
    });

    function createCollections() {
      collectionSubject.next(walletDB.addCollection('accounts', {unique: ['pk']}));
      collectionSubject.next(walletDB.addCollection('transactions', {unique: ['txID']}));
      collectionSubject.next(walletDB.addCollection('keys', {unique: ['accountID']}));
      collectionSubject.next(walletDB.addCollection('addressbook', {unique: ['accountID']}));
      createSubject.next(AppConstants.KEY_FINISHED);
    }
    this.walletDB = walletDB;
    return createSubject.asObservable();
  }

  openWallet(walletUUID: string): Observable<string> {
    this.logger.debug('### WalletService openWallet: ' + walletUUID);
    this.openWalletSubject.next(AppConstants.KEY_OPENING);
    const dbPath = this.localStorageService.get(AppConstants.KEY_WALLET_LOCATION);
    const walletLocation = path.join(dbPath, (walletUUID + '.db'));
    this.logger.debug('### WalletService Database File: ' + walletLocation);

    const collectionSubject = new Subject<any>();
    const openSubject = new Subject<string>();

    let openErrorHandled = false;
    openSubject.subscribe(result => {
      this.logger.debug('### WalletService openWallet: ' + result);
      if (result === AppConstants.KEY_LOADED) {
        // notify open complete
        this.openWalletSubject.next(result);
      } else if (result === AppConstants.KEY_ERRORED && openErrorHandled === false) {
        openErrorHandled = true;
        this.openWalletSubject.next(result);
      }
    });

    let openError = false;
    collectionSubject.subscribe(collection => {
      if (collection != null) {
        this.logger.debug('### WalletService Open Collection: ' + collection.name);
        if (collection.name === 'accounts') {
          this.accounts = collection;
        } else if (collection.name === 'transactions') {
          this.transactions = collection;
        } else if (collection.name === 'keys') {
          this.keys = collection;
        } else if (collection.name === 'addressbook') {
          this.addressbook = collection;
        }
        this.isWalletOpen = true;
      } else {
        openError = true;
        openSubject.next(AppConstants.KEY_ERRORED);
      }
    });

    const openCollections = (result) => {
      collectionSubject.next(walletDB.getCollection('accounts'));
      collectionSubject.next(walletDB.getCollection('transactions'));
      collectionSubject.next(walletDB.getCollection('keys'));
      if (!walletDB.getCollection('addressbook')) {
        collectionSubject.next(walletDB.addCollection('addressbook', {unique: ['accountID']}));
      } else {
        collectionSubject.next(walletDB.getCollection('addressbook'));
      }
      if (!openError) {
        openSubject.next(AppConstants.KEY_LOADED);
      }
    };

    this.lokiAdapter = new LokiIndexedAdapter('casinocoin');
    const walletDB = new loki(walletLocation,
      { adapter: this.lokiAdapter,
        autoload: true,
        autoloadCallback: openCollections,
        autosave: true,
        autosaveInterval: 5000
    });
    this.walletDB = walletDB;
    return this.openWalletSubject.asObservable();
  }

  // close the wallet
  closeWallet() {
    this.logger.debug('### WalletService - closeWallet() ###');
    // first save any open changes
    if (this.walletDB != null) {
      this.walletDB.saveDatabase();
    }
    // reset all collection objects
    this.accounts = null;
    this.transactions = null;
    this.keys = null;
    this.addressbook = null;
    // set wallet open to false
    this.isWalletOpen = false;
    // reset wallet object
    this.walletDB = null;
    // publish result
    this.openWalletSubject.next(AppConstants.KEY_CLOSED);
  }

  resetWallet() {
    // reset all collection objects
    this.accounts.clear();
    this.transactions.clear();
    this.keys.clear();
    this.addressbook.clear();
  }

  // encrypt secret key
  encryptSecretKey(decryptPin: string) {
    const cscCrypto = new CSCCrypto(decryptPin);
    const allKeys: Array<LokiTypes.LokiKey> = this.keys.find();
    allKeys.forEach( (element, index, array) => {
      if (!element.encrypted) {
        element.secret = cscCrypto.encrypt(element.secret);
      }
      element.encrypted = true;
      this.updateKey(element);
    });
  }

  // allow for a hard save on app exit
  saveWallet() {
    this.walletDB.saveDatabase();
  }

  // #########################################
  // Accounts Collection
  // #########################################

  addAddress(newAddress: LokiTypes.LokiAddress): LokiTypes.LokiAddress {
    const insertedAddress = this.addressbook.insert(newAddress);
    return insertedAddress;
  }

  getAddress(accountID: string): LokiTypes.LokiAddress {
    if (this.isWalletOpen) {
      if (this.addressbook.count() > 0) {
        return this.addressbook.findOne({'accountID': {'$eq': accountID}});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getAllAddresses(): Array<LokiTypes.LokiAddress> {
    if (this.isWalletOpen) {
      if (!this.addressbook) {
        return null;
      } else {
        return this.addressbook.find();
      }
    } else {
      return null;
    }

  }

  updateAddress(address: LokiTypes.LokiAddress) {
    this.addressbook.update(address);
  }

  removeAddress(accountID: string) {
    this.addressbook.findAndRemove({accountID: accountID});
  }

  addAccount(newAccount: LokiTypes.LokiAccount): LokiTypes.LokiAccount {
    const insertAccount = this.accounts.insert(newAccount);
    return insertAccount;
  }

  getAccount(token: string, accountID: string): LokiTypes.LokiAccount {
    if (this.isWalletOpen) {
      if (this.accounts.count() > 0) {
        return this.accounts.findOne({'pk': {'$eq': (token + accountID)}});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getTokenAccount(token: string): LokiTypes.LokiAccount {
    if (this.isWalletOpen) {
      if (this.accounts.count() > 0) {
        return this.accounts.findOne({'currency': {'$eq': token}});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getMainAccount(): LokiTypes.LokiAccount {
    if (this.isWalletOpen) {
      if (this.accounts.count() > 0) {
        return this.accounts.findOne({'$and': [{'currency': {'$eq': 'CSC'}}, {'accountSequence': {'$eq': 0}}]});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  deleteAccount(accountID) {
    this.accounts.findAndRemove({accountID: accountID});
  }

  getSortedCSCAccounts(sortAttribute: string, descending: boolean): Array<LokiTypes.LokiAccount> {
    return this.accounts.chain().find({'currency': {'$eq': 'CSC'}}).simplesort(sortAttribute, descending).data();
  }

  getAllAccounts(): Array<LokiTypes.LokiAccount> {
    return this.accounts.find();
  }

  getAllAccountsImported() {
    return this.accounts.find({'accountSequence': {'$eq': -1}});
  }

  getAllTokenAccountsByAccountID(accountID: string): Array<LokiTypes.LokiAccount> {
    if (this.isWalletOpen) {
      if (this.accounts.count() > 0) {
        // return token accounts for an account id sorted by token abbreviation
        return this.accounts.chain().find({'$and': [{'accountID': {'$eq': accountID}}, {'currency': {'$ne': 'CSC'}}]}).simplesort('currency', false).data();
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  updateAccount(account: LokiTypes.LokiAccount) {
    this.accounts.update(account);
  }

  getAccountBalance(accountID: string): string {
    const account = this.getAccount('CSC', accountID);
    if (account) {
      return account.balance;
    } else {
      return '0';
    }
  }

  getTokenBalance(token: string, accountID: string): string {
    const account = this.getAccount(token, accountID);
    if (account) {
      return account.tokenBalance;
    } else {
      return '0';
    }
  }

  isAccountMine(accountID: string): boolean {
    return (this.accounts.findOne({'accountID': {'$eq': accountID}}) != null);
  }

  isDefaultAccountMine(accountID: string): boolean {
    return (this.accounts.findOne({'accountID': {'$eq': accountID}, 'label' : 'Default Account'}) != null);
  }

  isSenderAccountOperator(accountID: string): boolean {
    return (this.accounts.findOne({'accountID': {'$eq': accountID}}) != null);
  }

  removeAccount(token: string, accountID: string) {
    this.accounts.findAndRemove({pk: (token + accountID)});
    this.accounts.ensureId();
  }

  getAccountsMaxSequence(): number {
    const account = this.accounts.chain().find().simplesort('accountSequence', true).limit(1).data()[0];
    if (!account) {
      return -1;
    } else {
      return account.accountSequence;
    }
  }

  // #########################################
  // Keys Collection
  // #########################################
  addKey(newKey: LokiTypes.LokiKey): LokiTypes.LokiKey {
    const insertedKey = this.keys.insert(newKey);
    return insertedKey;
  }

  getKey(accountID: string): LokiTypes.LokiKey {
    if (this.isWalletOpen) {
      if (this.keys.count() > 0) {
        return this.keys.findOne({'accountID': {'$eq': accountID}});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getAllKeys(): Array<LokiTypes.LokiKey> {
    return this.keys.find();
  }

  updateKey(key: LokiTypes.LokiKey) {
    this.keys.update(key);
  }

  removeKey(accountID: string) {
    this.keys.findAndRemove({accountID: accountID});
  }

  // #########################################
  // Transactions Collection
  // #########################################
  addTransaction(newTransaction: LokiTypes.LokiTransaction): LokiTypes.LokiTransaction {
    const tx = this.getTransaction(newTransaction.txID);
    this.logger.debug('### WalletService - addTransaction: ' + JSON.stringify(tx));
    if (tx == null) {
      return this.transactions.insert(newTransaction);
    } else {
      return tx;
    }
  }

  getTransaction(inputTxID: string): LokiTypes.LokiTransaction {
    if (this.isWalletOpen) {
      if (this.transactions.count() > 0) {
        return this.transactions.findOne({'txID': {'$eq': inputTxID}});
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getAllTransactions(): Array<LokiTypes.LokiTransaction> {
    // return all transactions sorted by descending timestamp
    return this.transactions.chain().find().simplesort('timestamp', true).data();
  }

  countAccountsPerAccount(account) {
     return this.transactions.find({ 'accountID': account }).length;
  }

  deleteTransactions(account) {
    this.transactions.findAndRemove({accountID: account});
  }

  countAccountsPerDate(date) {
    const isoStringDate = new Date(date).toISOString();
    const dateUTC = CSCUtil.iso8601ToCasinocoinTime(isoStringDate) - 18000;
    return this.transactions.find({ timestamp: { '$between': [dateUTC, dateUTC + 86399] } }).length;
  }

  countAccountsPerToken(token) {
    return this.transactions.find({ 'currency': token }).length;
  }

  getTransactionsLazy(offset: number, limit: number): Array<LokiTypes.LokiTransaction> {
    // return all transactions sorted by descending timestamp for offset and limit
    return this.transactions.chain().find()
                                    .simplesort('timestamp', true)
                                    .offset(offset)
                                    .limit(limit)
                                    .data();
  }

  getTransactionsLazyAccount(offset: number, limit: number, account): Array<LokiTypes.LokiTransaction> {
    return this.transactions.chain().find({'accountID': account})
                                    .simplesort('timestamp', true)
                                    .offset(offset)
                                    .limit(limit)
                                    .data();
  }

  getTransactionsLazyCurrency(offset: number, limit: number, currency): Array<LokiTypes.LokiTransaction> {
    return this.transactions.chain().find({ 'currency': currency })
                                    .simplesort('timestamp', true)
                                    .offset(offset)
                                    .limit(limit)
                                    .data();
  }

  getTransactionsLazyDate(offset: number, limit: number, date): Array<LokiTypes.LokiTransaction> {
    const isoStringDate = new Date(date).toISOString();
    const dateUTC = CSCUtil.iso8601ToCasinocoinTime(isoStringDate) - 18000;
    // const dateTimestampTT = CSCUtil.casinocoinTimeToISO8601(dateUTC);
    // const dateTimestampT2 = CSCUtil.casinocoinTimeToISO8601(dateUTC + 86399);
    // const dateTimestamp = this.datePipe.transform(628749799, 'M/dd/yyyy hh:ss');
    return this.transactions.chain().find({ timestamp: { '$between': [dateUTC, dateUTC + 86399] }})
                                    .simplesort('timestamp', true)
                                    .offset(offset)
                                    .limit(limit)
                                    .data();
  }


  getUnvalidatedTransactions(): Array<LokiTypes.LokiTransaction> {
    return this.transactions.find({ validated: false });
  }

  updateTransaction(transaction: LokiTypes.LokiTransaction): LokiTypes.LokiTransaction {
    const tx = this.getTransaction(transaction.txID);
    this.logger.debug('### WalletService - updateTransaction: ' + JSON.stringify(tx));
    if (tx == null ) {
      return this.transactions.insert(transaction);
    } else {
      return this.transactions.update(transaction);
    }
  }

  getAccountTransactions(inputAccountID: string): Array<LokiTypes.LokiTransaction> {
    // return all validated transactions for an account id sorted by ascending ledger index
    return this.transactions.chain().find(
      { $or: [{ accountID: inputAccountID, validated: true}, {destination: inputAccountID, validated: true}]}
    ).simplesort('inLedger', false).data();
  }

  getAccountTXBalance(inputAccountID: string): string {
    // get all transactions
    let totalBalance: Big = new Big('0');
    const allAccountTX: Array<LokiTypes.LokiTransaction> = this.getAccountTransactions(inputAccountID);
    allAccountTX.forEach(element => {
      // if accountID == inputAccountID its outgoing else its incomming
      if (element.accountID === inputAccountID) {
        totalBalance = totalBalance.minus(element.amount);
        // also remove fees
        totalBalance = totalBalance.minus(element.fee);
      } else if (element.destination === inputAccountID) {
        if (element.amount) {
          totalBalance = totalBalance.plus(element.amount);
        }
      }
    });
    // special case for the genesis account that was initialized with 40.000.000.000 coins
    if (inputAccountID === 'cHb9CJAWyB4cj91VRWn96DkukG4bwdtyTh') {
      totalBalance = totalBalance.plus('4000000000000000000');
    }
    return totalBalance.toString();
  }

  isTransactionIndexValid(): boolean {
    let result = true;
    const idIndex = this.transactions.idIndex;
    let lastIndex = 0;
    idIndex.forEach(element => {
      if (element === (lastIndex + 1)) {
        lastIndex = lastIndex + 1;
      } else {
        result = false;
      }
    });
    return result;
  }

  clearTransactions() {
    this.transactions.clear({removeIndices: true});
  }

  // #########################################
  // Wallet Methods
  // #########################################
  generateWalletPasswordHash(walletUUID: string, password: string): string {
    const passwordHash = crypto.createHmac('sha256', password).update(walletUUID).digest('hex');
    return passwordHash;
  }

  checkWalletPasswordHash(password: string, inputWalletUUID?: string, inputWalletHash?: string): boolean {
    let walletUUID;
    if (inputWalletUUID) {
      walletUUID = inputWalletUUID;
    } else {
      walletUUID = this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET).walletUUID;
    }
    let walletHash;
    if (inputWalletHash) {
      walletHash = inputWalletHash;
    } else {
      walletHash = this.localStorageService.get(AppConstants.KEY_WALLET_PASSWORD_HASH);
    }
    const passwordHash = crypto.createHmac('sha256', password).update(walletUUID).digest('hex');
    return (walletHash === passwordHash);
  }

  encryptAllKeys(password: string, email: string): Observable<string> {
    this.logger.debug('### WalletService encryptAllKeys ###');
    const encryptSubject = new BehaviorSubject<string>(AppConstants.KEY_INIT);
    // get all keys
    const allKeys: Array<LokiTypes.LokiKey> = this.keys.find();
    const cscCrypto = new CSCCrypto(password, email);
    allKeys.forEach( (element, index, array) => {
      if (!element.encrypted) {
        // encrypt private key
        const cryptedKey = cscCrypto.encrypt(element.privateKey);
        array[index].privateKey = cryptedKey;
        // encrypt secret
        const cryptedSecret = cscCrypto.encrypt(element.secret);
        array[index].secret = cryptedSecret;
        array[index].encrypted = true;
      }
      if (index === (array.length - 1)) {
        encryptSubject.next(AppConstants.KEY_FINISHED);
      }
    });
    return encryptSubject.asObservable();
  }

  decryptAllKeys(password: string, email: string): Array<LokiTypes.LokiKey> {
    this.logger.debug('### decryptAllKeys: ' + email);
    if (this.checkWalletPasswordHash(password)) {
      // get all keys
      const allKeys: Array<LokiTypes.LokiKey> = this.keys.find();
      const decryptedKeys: Array<LokiTypes.LokiKey> = [];
      const cscCrypto = new CSCCrypto(password, email);
      allKeys.forEach( (element, index, array) => {
        // decrypt key
        this.logger.debug('Decrypt[' + index + ']: ' + JSON.stringify(element));
        const decodedSecret: string = cscCrypto.decrypt(element.secret);
        const decodedKeypair = this.cscOfflineAPI.deriveKeypair(decodedSecret);
        // check if public key is the same
        if (decodedKeypair.publicKey === element.publicKey) {
          // save decrypted values onto object
          const decodedKey: LokiKey = {
            accountID: element.accountID,
            publicKey: decodedKeypair.publicKey,
            privateKey: decodedKeypair.privateKey,
            secret: decodedSecret,
            encrypted: false
          };
          decryptedKeys.push(decodedKey);
        }
      });
      return decryptedKeys;
    } else {
      return [];
    }
  }

  getDecryptPrivateKey(password: string, email: string, walletKey: LokiTypes.LokiKey): string {
    const cscCrypto = new CSCCrypto(password, email);
    const decodedSecret: string = cscCrypto.decrypt(walletKey.secret);
    const decodedKeypair = this.cscOfflineAPI.deriveKeypair(decodedSecret);
    if (decodedKeypair.publicKey === walletKey.publicKey) {
      // password was correct, return decoded private key
      return decodedKeypair.privateKey;
    } else {
      return AppConstants.KEY_ERRORED;
    }
  }

  getDecryptSecret(password: string, email: string, walletKey: LokiTypes.LokiKey): string {
    const cscCrypto = new CSCCrypto(password, email);
    const decodedSecret: string = cscCrypto.decrypt(walletKey.secret);
    const decodedKeypair = this.cscOfflineAPI.deriveKeypair(decodedSecret);
    if (decodedKeypair.publicKey === walletKey.publicKey) {
      // password was correct, return decoded private key
      return decodedSecret;
    } else {
      return AppConstants.KEY_ERRORED;
    }
  }

  importPrivateKey(keySeed: string, password: string, email: string) {

    const newKeyPair: LokiTypes.LokiKey = {
      privateKey: '',
      publicKey: '',
      accountID: '',
      secret: '',
      encrypted: false
    };
    const keypair = this.cscOfflineAPI.deriveKeypair(keySeed);
    newKeyPair.privateKey = keypair.privateKey;
    newKeyPair.publicKey = keypair.publicKey;
    newKeyPair.accountID = this.cscOfflineAPI.deriveAddress(keypair.publicKey);
    newKeyPair.secret = keySeed;
    // save the new private key
    this.addKey(newKeyPair);
    // add new account
    const walletAccount: LokiTypes.LokiAccount = {
      pk: ('CSC' + newKeyPair.accountID),
      accountID: newKeyPair.accountID,
      accountSequence: -1,
      currency: 'CSC',
      balance: '0',
      lastSequence: 0,
      label: 'Imported Private Key',
      tokenBalance: '0',
      activated: false,
      ownerCount: 0,
      lastTxID: '',
      lastTxLedger: 0
    };
    this.addAccount(walletAccount);
    // encrypt the keys
    this.encryptAllKeys(password, email).subscribe(result => {
      this.notificationService.addMessage( {severity: SeverityType.info,
                                            title: 'Private Key Import',
                                            body: 'The Private Key import is complete.'
                                           });
    });
  }

  getWalletBalance(token: string): string {
    let totalBalance = new Big('0');
    if (this.isWalletOpen) {
      // loop over all accounts
      const accounts: Array<LokiTypes.LokiAccount> = this.accounts.find({'currency': {'$eq': token}});
      accounts.forEach(element => {
        totalBalance = totalBalance.plus(element.balance);
      });
    }
    return totalBalance.toString();
  }

  getWalletTxCount(): number {
    if (this.isWalletOpen) {
      return this.transactions.count();
    } else {
      return 0;
    }
  }

  getWalletLastTx(): LokiTypes.LokiTransaction {
    if (this.isWalletOpen) {
      const txArray: Array<LokiTypes.LokiTransaction> = this.transactions.chain().find().simplesort('timestamp', true).data();
      if (txArray.length > 0) {
        return txArray[0];
      } else {
        return null;
      }
    } else {
      return null;
    }
  }

  getWalletDump(): string {
    return LZString.compressToBase64(this.walletDB.serialize());
  }

  importWalletDump(dumpContents: string, walletLocation: string, walletUUID: string) {
    this.logger.debug('### WalletService Restore - location: ' + walletLocation + ' UUID: ' + walletUUID);
    const decompressed = LZString.decompressFromBase64 (dumpContents);
    let walletOpenError = false;
    const restoreFinished = new Subject();
    // subscribe to updates
    this.openWalletSubject.pipe(takeUntil(restoreFinished)).subscribe( result => {
      this.logger.debug('### WalletService Restore - openSubject: ' + result);
      if (result === AppConstants.KEY_LOADED) {
        this.logger.debug('### WalletService Restore- loadJSON()');
        restoreFinished.next();
        this.walletDB.loadJSON(decompressed);
        this.closeWallet();
      } else if (result === AppConstants.KEY_ERRORED && walletOpenError === false) {
        this.logger.debug('### WalletService Restore - openWallet Failed for restore. Create new wallet');
        walletOpenError = true;
        // wallet could not be opened so create new
        this.walletSetup.walletLocation = walletLocation;
        this.walletSetup.walletUUID = walletUUID;
        this.createWallet().subscribe( createResult => {
          if (createResult === AppConstants.KEY_LOADED) {
            this.logger.debug('### WalletService - loadJSON()');
            restoreFinished.next();
            this.walletDB.loadJSON(decompressed);
            this.closeWallet();
          }
        });
      }
    });
    // open the wallet
    this.openWallet(walletUUID);
  }
}
