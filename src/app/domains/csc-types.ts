import int from 'int';

export interface PrepareTxPayment  {
    source: string;
    destination: string;
    amountDrops: string;
    feeDrops: string;
    description?: string;
    invoiceID?: string;
    sourceTag?: int;
    destinationTag?: int;
}

export interface CasinocoinTxObject  {
    TransactionType: string;
    Account: string;
    Destination: string;
    Amount: string;
    Fee: string;
    Flags: number;
    Sequence: number;
    LastLedgerSequence: number;
    InvoiceID?: string;
    Memos?: Array<CasinocoinMemo>;
    SourceTag?: int;
    DestinationTag?: int;
    TxnSignature?: string;
    SigningPubKey?: string;
}

export interface CasinocoinSignerListTx {
    TransactionType: string;
    Account: string;
    Fee: string;
    Flags: number;
    SignerQuorum: number;
    SignerEntries: [
        { SignerEntry: {
            Account: string;
            SignerWeight: number;
        }}
    ];
    TxnSignature?: string;
    SigningPubKey?: string;
}

export interface CasinocoinMemo {
    Memo: {
        MemoData?: string;
        MemoFormat?: string;
        MemoType?: string;
    };
}

export interface CasinocoindAmountIOU {
    currency: string;
    value: string;
    issuer?: string;
}

export type CasinocoindAmount = string | CasinocoindAmountIOU;


export interface Amount {
    value: string;
    currency: string;
    counterparty?: string;
}

// Amount where counterparty and value are optional
export interface LaxLaxAmount {
    currency: string;
    value?: string;
    counterparty ?: string;
}

// A currency-counterparty pair, or just currency if it's CSC
export interface Issue {
    currency: string;
    counterparty?: string;
}

export interface Adjustment {
    address: string;
    amount: Amount;
    tag?: number;
}

export interface MaxAdjustment {
    address: string;
    maxAmount: Amount;
    tag?: number;
}

export interface MinAdjustment {
    address: string;
    minAmount: Amount;
    tag?: number;
}

export interface Memo {
    memo: {
        memoType?: string;
        memoFormat?: string;
        memoData?: string;
    };
}

export interface PaymentFlags {
    NoCasinocoinDirect: 0x00010000;
    PartialPayment: 0x00020000;
    LimitQuality: 0x00040000;
}

export interface Payment {
    source: Adjustment | MaxAdjustment;
    destination: Adjustment | MinAdjustment;
    paths?: string;
    memos?: Array < Memo >;
    // A 256-bit hash that can be used to identify a particular payment
    invoiceID?: string;
    // A boolean that, if set to true, indicates that this payment should go
    // through even if the whole amount cannot be delivered because of a lack of
    // liquidity or funds in the source_account account
    allowPartialPayment?: boolean;
    // A boolean that can be set to true if paths are specified and the sender
    // would like the Casinocoin Network to disregard any direct paths from
    // the source_account to the destination_account. This may be used to take
    // advantage of an arbitrage opportunity or by gateways wishing to issue
    // balances from a hot wallet to a user who has mistakenly set a trustline
    // directly to the hot wallet
    noDirectCasinocoin?: boolean;
    limitQuality?: boolean;
}

export interface Instructions {
    sequence?: number;
    fee?: string;
    maxFee?: string;
    maxLedgerVersion?: number;
    maxLedgerVersionOffset?: number;
    signersCount?: number;
}

export interface Prepare {
    txJSON: string;
    instructions: {
     fee: string;
     sequence: number;
     maxLedgerVersion?: number;
    };
}

export interface CSCURI {
    address: string;
    token: string;
    amount?: string;
    destinationTag?: number;
    label?: string;
}

export interface WalletSetup {
    userEmail: string;
    userPassword: string;
    recoveryMnemonicWords: string[];
    walletUUID: string;
    walletPasswordHash: string;
    walletLocation: string;
    backupLocation: string;
    testNetwork: boolean;
}

export interface WalletDefinition {
    walletUUID: string;
    creationDate: number;
    location: string;
    userEmail: string;
    passwordHash: string;
    mnemonicHash: string;
    network: string;
}

export interface WalletSettings {
    showNotifications: boolean;
    fiatCurrency: string;
}

export interface LedgerStreamMessages {
    fee_base: number;
    fee_ref: number;
    ledger_hash: string;
    ledger_index: number;
    ledger_time: number;
    reserve_base: number;
    reserve_inc: number;
    txn_count?: number;
    type?: string;
    validated_ledgers: string;
}

export interface TokenType {
    IconImage: string;
    PK: string;
    ApiEndpoint: string;
    ContactEmail: string;
    Flags: number;
    FullName: string;
    IconURL: string;
    Issuer: string;
    Token: string;
    TotalSupply: string;
    Website: string;
    AccountID: string;
    Activated: boolean;
    Balance: string;
    OwnerCount: number;
    TokenBalance: string;
    CoinValue: string;
    AccountLabel: string;
}

export interface TokenConfigData {
    ApiEndpoint: string;
    ContactEmail: string;
    Flags: number;
    FullName: string;
    IconURL: string;
    Issuer: string;
    Token: string;
    TotalSupply: string;
    Website: string;
  }

export interface ServerDefinition {
    server_id: string;
    server_url: string;
    server_name: string;
    public_key?: string;
    response_time?: number;
    connected?: boolean;
    serverState?: string;
    completeLedgers?: string;
}
