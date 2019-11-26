import 'reflect-metadata';
import '../polyfills';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';

import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { HttpClientModule, HttpClient } from '@angular/common/http';

import { AppRoutingModule } from './app-routing.module';

// NG Translate
import { TranslateModule, TranslateLoader } from '@ngx-translate/core';
import { TranslateHttpLoader } from '@ngx-translate/http-loader';

// 3rd Party Libs
import { LoggerModule, NgxLoggerLevel } from 'ngx-logger';

// Electron
import { ElectronService } from './providers/electron.service';

import { WebviewDirective } from './directives/webview.directive';

// Pipes
import { DatePipe, DecimalPipe, CurrencyPipe } from '@angular/common';
import { CSCDatePipe, CSCAmountPipe, ToNumberPipe } from './app-pipes.module';

// Components
import { AppComponent } from './app.component';
import { HomeComponent } from './components/home/home.component';
import { WalletSetupComponent } from './components/wallet-setup/wallet-setup.component';
import { SetupStep1Component } from './components/wallet-setup/step1-component';
import { SetupStep2Component } from './components/wallet-setup/step2-component';
import { SetupStep3Component } from './components/wallet-setup/step3-component';
import { SetupStep31Component } from './components/wallet-setup/step3.1-component';
import { SetupStep4Component } from './components/wallet-setup/step4-component';
import { SetupStep41Component } from './components/wallet-setup/step4.1-component';
import { SetupStep5Component } from './components/wallet-setup/step5-component';
import { LoginComponent } from './components/login/login.component';
import { RecoverMnemonicComponent } from './components/login/recover-mnemonic.component';
import { TokenlistComponent } from './components/tokenlist/tokenlist.component';
import { HistoryComponent } from './components/history/history.component';
import { ExchangesComponent } from './components/exchanges/exchanges.component';
import { SupportComponent } from './components/support/support.component';
import { PaperwalletComponent } from './components/paperwallet/paperwallet.component';
import { WindowRef } from './components/paperwallet/WindowRef';

// Providers
import { AuthGuard } from './auth-guard';
import { CasinocoinService } from './providers/casinocoin.service';
import { LogService } from './providers/log.service';
import { WebStorageModule, LocalStorageService, SessionStorageService, CookiesStorageService } from 'ngx-store';
import { WalletService } from './providers/wallet.service';
import { NotificationService } from './providers/notification.service';
import { MarketService } from './providers/market.service';

// import PrimeNG, Material and Bootstrap modules
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ToolbarModule } from 'primeng/toolbar';
import { AccordionModule } from 'primeng/accordion';
import { MenuModule } from 'primeng/menu';
import { PanelModule } from 'primeng/panel';
import { CalendarModule } from 'primeng/calendar';
import { InputTextModule } from 'primeng/inputtext';
import {TableModule} from 'primeng/table';
import {DropdownModule} from 'primeng/dropdown';
import {StepsModule} from 'primeng/steps';
import {PasswordModule} from 'primeng/password';
import {MessagesModule} from 'primeng/messages';
import {MessageModule} from 'primeng/message';
import {ContextMenuModule} from 'primeng/contextmenu';
import {TieredMenuModule} from 'primeng/tieredmenu';
import {InputTextareaModule} from 'primeng/inputtextarea';
import {ProgressSpinnerModule} from 'primeng/progressspinner';
import {RadioButtonModule} from 'primeng/radiobutton';
import {ListboxModule} from 'primeng/listbox';
import {ProgressBarModule} from 'primeng/progressbar';
import { MatListModule, MatSidenavModule, MatTooltipModule, MatButtonModule } from '@angular/material';
import { QRCodeModule } from 'angularx-qrcode';
import {CardModule} from 'primeng/card';

// AoT requires an exported function for factories
export function HttpLoaderFactory(http: HttpClient) {
  return new TranslateHttpLoader(http, './assets/i18n/', '.json');
}

@NgModule({
  declarations: [
    AppComponent,
    HomeComponent,
    WalletSetupComponent,
    SetupStep1Component,
    SetupStep2Component,
    SetupStep3Component,
    SetupStep31Component,
    SetupStep4Component,
    SetupStep41Component,
    SetupStep5Component,
    LoginComponent,
    RecoverMnemonicComponent,
    TokenlistComponent,
    HistoryComponent,
    ExchangesComponent,
    SupportComponent,
    PaperwalletComponent,
    WebviewDirective,
    CSCDatePipe, CSCAmountPipe, ToNumberPipe
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule,
    AppRoutingModule,
    TranslateModule.forRoot({
      loader: {
        provide: TranslateLoader,
        useFactory: (HttpLoaderFactory),
        deps: [HttpClient]
      }
    }),
    LoggerModule.forRoot({
      serverLoggingUrl: '/api/logs',
      level: NgxLoggerLevel.DEBUG,
      serverLogLevel: NgxLoggerLevel.ERROR
    }),
    WebStorageModule,
    DialogModule, ButtonModule, CheckboxModule,
    MessagesModule, MessageModule, ToolbarModule, AccordionModule,
    MenuModule, PanelModule, CalendarModule,
    DropdownModule, StepsModule, PasswordModule,
    MatListModule, MatSidenavModule, ContextMenuModule,
    TieredMenuModule, MatTooltipModule, MatButtonModule,
    InputTextareaModule, ProgressSpinnerModule, InputTextModule,
    TableModule, ListboxModule, RadioButtonModule, ProgressBarModule,
    QRCodeModule, CardModule
  ],
  providers: [
    AuthGuard,
    ElectronService,
    WalletService,
    CasinocoinService,
    LogService,
    NotificationService,
    MarketService,
    LocalStorageService, SessionStorageService, CookiesStorageService,
    DatePipe, DecimalPipe, CurrencyPipe,
    CSCDatePipe, CSCAmountPipe, ToNumberPipe,
    WindowRef
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
