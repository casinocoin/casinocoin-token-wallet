import { Component, OnInit, ViewEncapsulation, Input, Output, EventEmitter } from '@angular/core';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { WalletService } from '../../providers/wallet.service';

@Component({
    selector: 'app-setup-step3.1',
    templateUrl: './step3.1-component.html',
    encapsulation: ViewEncapsulation.None
  })
  export class SetupStep31Component {
    developerOptionShow = false;

    constructor( private logger: LogService,
                 private walletService: WalletService,
                 private router: Router) {
      this.walletTestNetwork = this.walletService.walletSetup.testNetwork;
    }

    networkChoiceDisabled = false;
    walletTestNetwork: boolean;
    keys_pressed: string;

    onNetworkChanged(newValue) {
      this.logger.debug('### Step 3.1 - Test Network?: ' + newValue);
      this.walletService.walletSetup.testNetwork = newValue;
    }

    developerOptions() {
      if (this.developerOptionShow) {
        this.developerOptionShow = false;
      } else {
        this.developerOptionShow = true;
      }
    }

    continue() {
      this.router.navigate(['wallet-setup', 'setup-step4']);
    }

  }
