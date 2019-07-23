import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { WalletService } from '../../providers/wallet.service';
import { CSCCrypto } from '../../domains/csc-crypto';

@Component({
    selector: 'app-setup-step4.1',
    templateUrl: './step4.1-component.html',
    encapsulation: ViewEncapsulation.None
  })
  export class SetupStep41Component implements OnInit {

    public word1: number;
    public word2: number;
    public word3: number;
    public checkWord1 = '';
    public checkWord2 = '';
    public checkWord3 = '';
    public showNotTheSameError = false;
    public continueEnabled = false;
    public previousDisabled = false;

    constructor( private logger: LogService,
                 private walletService: WalletService,
                 private router: Router ) { }

    ngOnInit() {
      this.logger.debug('### Setup -> Check mnemonic words ###');
      // generate 3 random picks from the 12 words
      this.word1 = Math.floor(Math.random() * 12) + 1;
      this.word2 = Math.floor(Math.random() * 12) + 1;
      while (this.word1 === this.word2) {
        this.word2 = Math.floor(Math.random() * 12) + 1;
      }
      this.word3 = Math.floor(Math.random() * 12) + 1;
      while (this.word1 === this.word3 || this.word2 === this.word3) {
        this.word3 = Math.floor(Math.random() * 12) + 1;
      }
      this.logger.debug('### Setup -> Check mnemonic words: ' + this.word1 + ' ' + this.word2 + ' ' + this.word3);
      this.logger.debug('### Setup -> Check mnemonic words: ' + this.walletService.walletSetup.recoveryMnemonicWords[this.word1 - 1] + ' ' +
                                                                this.walletService.walletSetup.recoveryMnemonicWords[this.word2 - 1] + ' ' +
                                                                this.walletService.walletSetup.recoveryMnemonicWords[this.word3 - 1]);
    }

    checkWordsUpdate() {
      this.logger.debug('### Setup -> checkWordsUpdate()');
      if (this.checkWord1.trim().length === 0 || this.checkWord2.trim().length === 0 || this.checkWord3.trim().length === 0) {
        this.continueEnabled = false;
        this.showNotTheSameError = false;
      } else {
        this.logger.debug('### Setup -> checkWordsUpdate() - all words filled out');
        // check the words
        const result1 = (this.checkWord1 === this.walletService.walletSetup.recoveryMnemonicWords[this.word1 - 1]);
        const result2 = (this.checkWord2 === this.walletService.walletSetup.recoveryMnemonicWords[this.word2 - 1]);
        const result3 = (this.checkWord3 === this.walletService.walletSetup.recoveryMnemonicWords[this.word3 - 1]);
        this.logger.debug('### Setup -> checkWordsUpdate() - result1: ' + result1 + ' result2: ' + result2 + ' result3: ' + result3);
        if (result1 && result2 && result3) {
          this.showNotTheSameError = false;
          this.continueEnabled = true;
          this.previousDisabled = true;
        } else {
          this.showNotTheSameError = true;
          this.continueEnabled = false;
          this.previousDisabled = false;
        }
      }
    }

    previous() {
      this.router.navigate(['wallet-setup', 'setup-step4']);
    }

    continue() {
      this.router.navigate(['wallet-setup', 'setup-step5']);
    }
  }
