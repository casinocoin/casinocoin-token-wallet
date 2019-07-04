import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { WalletService } from '../../providers/wallet.service';
import { CSCCrypto } from '../../domains/csc-crypto';

@Component({
    selector: 'app-setup-step4',
    templateUrl: './step4-component.html',
    encapsulation: ViewEncapsulation.None
  })
  export class SetupStep4Component implements OnInit {

    public newWalletMnemonic: Array<string>;
    public recoveryAccepted: boolean;
    public emailAddress: string;

    constructor( private logger: LogService,
                 private walletService: WalletService,
                 private router: Router ) { }

    ngOnInit() {
      if (this.newWalletMnemonic === undefined || this.newWalletMnemonic.length === 0) {
        this.newWalletMnemonic = CSCCrypto.getRandomMnemonic();
        this.walletService.walletSetup.recoveryMnemonicWords = this.newWalletMnemonic;
       }
       this.recoveryAccepted = false;
       this.emailAddress = this.walletService.walletSetup.userEmail;
    }

    continue() {
      this.router.navigate(['wallet-setup', 'setup-step5']);
    }
  }
