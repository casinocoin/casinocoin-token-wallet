import Big from 'big.js';
import int from 'int';

import { Amount, Memo, CasinocoindAmount, CasinocoinMemo, CSCURI } from './csc-types';

export class CSCUtil {

    static casinocoinToUnixTimestamp(rpepoch: number): number {
        return (rpepoch + 0x386D4380) * 1000;
    }

    static unixToCasinocoinTimestamp(timestamp: number): number {
        return Math.round(timestamp / 1000) - 0x386D4380;
    }

    static casinocoinTimeToISO8601(casinocoinTime: number): string {
        return new Date(this.casinocoinToUnixTimestamp(casinocoinTime)).toISOString();
    }

    static iso8601ToCasinocoinTime(iso8601: string): number {
        return this.unixToCasinocoinTimestamp(Date.parse(iso8601));
    }

    static casinocoinTimeNow(): number {
        return this.unixToCasinocoinTimestamp(Date.now());
    }

    static isoTimeNow(): string {
        return new Date().toISOString();
    }

    static dropsToCsc(drops: string): string {
        const bigDrops = new Big(drops);
        if (bigDrops > 0) {
            return (bigDrops).div(100000000.0).toString();
        } else {
            return '0.00';
        }
    }

    static cscToDrops(csc: string): string {
        const csc_drops = (new Big(csc)).times(100000000.0);
        return csc_drops.toString();
    }

    static toCasinocoindAmount(amount: Amount): CasinocoindAmount {
        if (amount.currency === 'CSC') {
            const csc_drops = this.cscToDrops(amount.value);
            return csc_drops;
        }
        const default_object: CasinocoindAmount = {
            currency: amount.currency,
            issuer: amount.counterparty ? amount.counterparty :  undefined,
            value: amount.value
        };
        return default_object;
    }

    static decodeMemos(memos: Array<CasinocoinMemo>): Array<Memo> {
        function removeUndefined(obj: Object): Object {
            // return _.omit(obj, _.isUndefined)
            Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
            return obj;
        }
        function hexToString(hex: string): string {
            return hex ? Buffer.from(hex, 'hex').toString('utf-8') : undefined;
        }

        if (!Array.isArray(memos) || memos.length === 0) {
            return undefined;
        }
        return memos.map(m => {
            const memoObject = { memo:
                removeUndefined({
                    memoType: hexToString(m['Memo'].MemoType),
                    memoFormat: hexToString(m['Memo'].MemoFormat),
                    memoData: hexToString(m['Memo'].MemoData)
                })
            };
            return memoObject;
        });
    }

    static encodeMemo(inputMemo: Memo): CasinocoinMemo {
        function removeUndefined(obj: Object): Object {
            // return _.omit(obj, _.isUndefined)
            Object.keys(obj).forEach(key => obj[key] === undefined && delete obj[key]);
            return obj;
        }
        function stringToHex(string: string): string {
            // limit data to 256 bytes
            return string ? (Buffer.from(string.substring(0, 256), 'utf8')).toString('hex').toUpperCase() : undefined;
        }
        return {
            Memo: removeUndefined({
                MemoData: stringToHex(inputMemo.memo.memoData),
                MemoType: stringToHex(inputMemo.memo.memoType),
                MemoFormat: stringToHex(inputMemo.memo.memoFormat)
            })
        };
    }

    static decodeInvoiceID(hex: string): string {
        // remove start padding
        function removePadStart(string, padString) {
            // hex encoding -> remove every "00"
            let resultString = string;
            while (resultString.startsWith(padString)) {
                resultString = resultString.substring(2);
            }
            return resultString;
        }
        const unpaddedString = removePadStart(hex, '00');
        return (unpaddedString ? Buffer.from(unpaddedString, 'hex').toString('utf-8') : '');
    }

    /* tslint:disable */
    static encodeInvoiceID(encodeString: string): string {
        // limit data to 32 bytes (256 bit) left padded with 0 to 64 length for double digit hex
        function padStart(inputString, padString) {
            let targetLength = 64;
            targetLength = targetLength >> 0; // floor if number or convert non-number to 0;
            padString = String(padString || ' ');
            if (inputString.length > targetLength) {
                return inputString;
            } else {
                targetLength = targetLength - inputString.length;
                if (targetLength > padString.length) {
                    padString += padString.repeat(targetLength / padString.length); //append to original to ensure we are longer than needed
                }
                return padString.slice(0, targetLength) + inputString;
            }
        }
        // encode
        let encoded = encodeString ? (Buffer.from(encodeString.substring(0, 32), 'utf8')).toString('hex').toUpperCase() : '';
        encoded = padStart(encoded, '0');
        return encoded;
    }
    /* tslint:enable */

    // private bytesToHex(byteArray) {
    //     return Array.from(byteArray, function(byte: number) {
    //       return ('0' + (byte & 0xFF).toString(16).toUpperCase()).slice(-2);
    //     }).join('')
    // }

    static validateAccountID(accountID: string): boolean {
        // prepare position lookup table with casinocoin alphabet
        const vals = 'cpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2brdeCg65jkm8oFqi1tuvAxyz';
        // check if address starts with lowercase 'c'
        if (!accountID.startsWith('c')) {
            return false;
        }
        // decode the the address
        const positions = {};
        for (let i1 = 0 ; i1 < vals.length ; ++i1) {
            positions[vals[i1]] = i1;
        }
        const base = 58;
        const length = accountID.length;
        let num = int(0);
        let leading_zero = 0;
        let seen_other = false;
        for (let i2 = 0; i2 < length ; ++i2) {
            const char = accountID[i2];
            const p = positions[char];
            // if we encounter an invalid character, decoding fails
            if (p === undefined) {
                return false;
            }
            num = num.mul(base).add(p);
            if (char === '1' && !seen_other) {
                ++leading_zero;
            } else {
                seen_other = true;
            }
        }
        let hex = num.toString(16);
        // num.toString(16) does not have leading 0
        if (hex.length % 2 !== 0) {
            hex = '0' + hex;
        }
        // strings starting with only ones need to be adjusted
        // e.g. '1' should map to '00' and not '0000'
        if (leading_zero && !seen_other) {
            --leading_zero;
        }
        while (leading_zero-- > 0) {
            hex = '00' + hex;
        }
        // addresses should always be 48 positions long
        if (hex.length === 48) {
            return true;
        } else {
            return false;
        }
    }

    static convertStringVersionToNumber(version: string): int {
        // remove points
        const dotlessVersion = version.split('.').join('');
        return int(dotlessVersion);
    }

    static generateCXXQRCodeURI(address: string) {
        return 'casinocoin:' + address + '?label=' + encodeURI('Swap Deposit');
    }

    static generateCSCQRCodeURI(input: CSCURI) {
        let uri = 'https://casinocoin.org/send?to=' + input.address;
        if (input.amount) {
            uri = uri + '&amount=' + input.amount;
        }
        if (input.destinationTag) {
            uri = uri + '&dt=' + input.destinationTag;
        }
        if (input.label) {
            uri = uri + '&label=' + input.label;
        }
        return uri;
    }

    static decodeCSCQRCodeURI(input: string): CSCURI {
        // let commandStart = input.indexOf(".org/")+5;
        const paramString = input.substr(input.indexOf('?') + 1);
        const params: string[] = paramString.split('&');
        let address, amount, destinationTag, label;
        params.forEach( value => {
            if (value.startsWith('to')) {
                address = value.substr(value.indexOf('=') + 1);
            } else if (value.startsWith('label')) {
                label = value.substr(value.indexOf('=') + 1);
            } else if (value.startsWith('amount')) {
                amount = value.substr(value.indexOf('=') + 1);
            } else if (value.startsWith('dt')) {
                destinationTag = value.substr(value.indexOf('=') + 1);
            }
        });
        if (address === undefined) {
            return null;
        } else {
            const uri: CSCURI = {
                address: address
            };
            if (amount !== undefined) {
                uri.amount = amount;
            }
            if (destinationTag !== undefined) {
                uri.destinationTag = destinationTag;
            }
            if (label !== undefined) {
                uri.label = label;
            }
            return uri;
        }
    }
}
