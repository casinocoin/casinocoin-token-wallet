import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { SessionStorageService, LocalStorageService } from 'ngx-store';
import { LogService } from './providers/log.service';
import { AppConstants } from './domains/app-constants';

@Injectable()
export class AuthGuard implements CanActivate {

    constructor(private router: Router,
                private sessionStorageService: SessionStorageService,
                private localStorageService: LocalStorageService,
                private logger: LogService) {
                this.logger.debug('### INIT AuthGuard');
    }

    canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): boolean {
        this.logger.debug('### AuthGuard route: ' + route.toString());
        this.logger.debug('### AuthGuard route component: ' + route.routeConfig.component.name);
        // Check if wallet creation is running
        if (this.sessionStorageService.get(AppConstants.KEY_CREATE_WALLET_RUNNING)) {
            // its ok
            return false;
        }
        // Check if we want to recover our wallet
        if (route.routeConfig.component.name === 'RecoverMnemonicComponent') {
            // always allowed
            return true;
        }
        // Check if we have an opened wallet
        if (this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET)) {
            // wallet open so return true
            this.logger.debug('### AuthGuard - Wallet Selected?: ' + JSON.stringify(this.sessionStorageService.get(AppConstants.KEY_CURRENT_WALLET)));
            this.logger.debug('### AuthGuard - Route: ' + route.toString());
            return true;
        }
        // Wallet not open, check if setup has been completed
        if (this.localStorageService.get(AppConstants.KEY_SETUP_COMPLETED)) {
            // setup complete but wallet not open so redirect to login
            this.logger.debug('### Setup complete, User not Logged in, redirect to Login ###');
            this.router.navigate(['/login'], { queryParams: { returnUrl: state.url }});
            return false;
        } else {
            // Run Setup
            this.logger.debug('### No wallet, redirect to Setup ###');
            this.router.navigate(['/wallet-setup'], { queryParams: { returnUrl: state.url }});
            return false;
        }
    }

    canActivateChild(): boolean {
        return true;
      }
}

