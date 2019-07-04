import { Component, ViewEncapsulation } from '@angular/core';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { AppConstants } from '../../domains/app-constants';

@Component({
    selector: 'app-setup-step2',
    templateUrl: './step2-component.html',
    encapsulation: ViewEncapsulation.None,
  })
  export class SetupStep2Component {

    disclaimerText: string;
    disclaimerAccepted: boolean;

    constructor( private logger: LogService,
                 private router: Router ) {
      this.disclaimerText = AppConstants.DISLAIMER_TEXT;
      this.disclaimerAccepted = false;
    }

    continue() {
      this.logger.debug('### Continue to step 3');
      this.router.navigate(['wallet-setup', 'setup-step3']);
    }
  }
