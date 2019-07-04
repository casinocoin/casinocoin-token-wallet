import { Component, OnInit, ViewEncapsulation } from '@angular/core';
import {Validators, FormControl, FormGroup, FormBuilder} from '@angular/forms';
import { Router } from '@angular/router';
import { LogService } from '../../providers/log.service';
import { WalletService } from '../../providers/wallet.service';

@Component({
    selector: 'app-setup-step3',
    templateUrl: './step3-component.html',
    encapsulation: ViewEncapsulation.None
  })
  export class SetupStep3Component implements OnInit {

    userform: FormGroup;

    newWalletPassword: string;
    newWalletPasswordConfirmed: string;
    paswordConfirmationEnabled = false;

    passwordPattern = '(?=.*[0-9])(?=.*[a-z]).{8,}';

    constructor( private logger: LogService,
                 private router: Router,
                 private walletService: WalletService ,
                 private fb: FormBuilder ) { }

    ngOnInit() {
        this.userform = this.fb.group({
            'email': new FormControl('', Validators.compose([Validators.required, Validators.email])),
            'password': new FormControl('', Validators.compose([Validators.required, Validators.minLength(6)])),
            'confirmPassword': new FormControl('', Validators.compose([Validators.required, Validators.minLength(6)]))
        });
    }

    checkPasswordUpdate(newValue: string) {
      if (newValue !== undefined) {
        const testResult = newValue.match(this.passwordPattern);
        if (testResult != null) {
          this.paswordConfirmationEnabled = true;
        } else {
          this.paswordConfirmationEnabled = false;
        }
      }
    }

    checkPasswordConfirmedUpdate(newConfirmValue: string) {
      if (newConfirmValue === this.newWalletPassword) {
        this.walletService.walletSetup.userPassword = newConfirmValue;
      }
    }

    onSubmit(value) {
        this.logger.debug('### onSubmit: ' + JSON.stringify(value.email));
        this.walletService.walletSetup.userEmail = value.email;
        this.walletService.walletSetup.userPassword = value.password;
        // navigate to step 4
        this.router.navigate(['wallet-setup', 'setup-step4']);
    }
  }
