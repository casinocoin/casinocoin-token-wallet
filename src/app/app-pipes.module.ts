import { Pipe, PipeTransform } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { CSCUtil } from './domains/csc-util';

/*
 * Transform CSC date to indicated format
 * Usage:
 *   value | cscDate:"date_format"
*/
@Pipe({name: 'cscDate'})
export class CSCDatePipe implements PipeTransform {
    constructor(private datePipe: DatePipe) {}

    transform(value: number, format: string): string {
        const unixTimestamp = CSCUtil.casinocoinToUnixTimestamp(value);
        return this.datePipe.transform(unixTimestamp, format);
    }
}

@Pipe({name: 'cscAmount'})
export class CSCAmountPipe implements PipeTransform {
    constructor(private numberPipe: DecimalPipe) {}

    transform(value, includeCurrency: boolean, numberFormat: boolean): string {
        if (value == null) {
            return '';
        } else if (isNaN(value)) {
            let amount = CSCUtil.dropsToCsc(value);
            if (numberFormat != null && numberFormat) {
                amount = this.numberPipe.transform(amount, '1.2-8');
            }
            if (includeCurrency) {
                amount = amount + ' CSC';
            }
            return amount;
        } else {
            let amount = CSCUtil.dropsToCsc(value.toString());
            if (numberFormat != null && numberFormat) {
                amount = this.numberPipe.transform(amount, '1.2-8');
            }
            if (includeCurrency) {
                amount = amount + ' CSC';
            }
            return amount;
        }
    }
}

@Pipe({ name: 'toNumber'})
export class ToNumberPipe implements PipeTransform {
    transform(value: string): any {
        const retNumber = Number(value);
        return isNaN(retNumber) ? 0 : retNumber;
    }
}
