import { HomeComponent } from './components/home/home.component';
import { WalletSetupComponent } from './components/wallet-setup/wallet-setup.component';
import { SetupStep1Component } from './components/wallet-setup/step1-component';
import { SetupStep2Component } from './components/wallet-setup/step2-component';
import { SetupStep3Component } from './components/wallet-setup/step3-component';
import { SetupStep4Component } from './components/wallet-setup/step4-component';
import { SetupStep5Component } from './components/wallet-setup/step5-component';
import { LoginComponent } from './components/login/login.component';
import { TokenlistComponent } from './components/tokenlist/tokenlist.component';
import { HistoryComponent } from './components/history/history.component';
import { ExchangesComponent } from './components//exchanges/exchanges.component';
import { SupportComponent } from './components/support/support.component';
import { AuthGuard } from './auth-guard';
import { NgModule } from '@angular/core';
import { Routes, RouterModule } from '@angular/router';
import { RecoverMnemonicComponent } from './components/login/recover-mnemonic.component';

const routes: Routes = [
    { path: 'home', component: HomeComponent, canActivate: [AuthGuard],
        children: [
            { path: 'tokenlist', component: TokenlistComponent },
            { path: 'market-info', component: HomeComponent },
            { path: 'history', component: HistoryComponent },
            { path: 'exchanges', component: ExchangesComponent },
            { path: 'settings', component: HomeComponent },
            { path: 'support', component: SupportComponent },
            { path: 'exit', component: HomeComponent },
            { path: '', redirectTo: 'tokenlist', pathMatch: 'full'}
     ]
    },
    { path: 'wallet-setup', component: WalletSetupComponent,
        children: [
            { path: 'setup-step1', component: SetupStep1Component },
            { path: 'setup-step2', component: SetupStep2Component },
            { path: 'setup-step3', component: SetupStep3Component },
            { path: 'setup-step4', component: SetupStep4Component },
            { path: 'setup-step5', component: SetupStep5Component },
            { path: '', redirectTo: 'setup-step1', pathMatch: 'full'}
     ]
    },
    { path: 'login', component: LoginComponent },
    { path: 'recoverMnemonic', component: RecoverMnemonicComponent, canActivate: [AuthGuard]},

    // otherwise redirect to home
    { path: '**', redirectTo: 'home' }
];

@NgModule({
    imports: [RouterModule.forRoot(routes, {useHash: true})],
    exports: [RouterModule]
})
export class AppRoutingModule { }
