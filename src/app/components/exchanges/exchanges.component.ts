import { Component, OnInit } from '@angular/core';
import { LogService } from '../../providers/log.service';
import { Menu as ElectronMenu} from 'electron';
import { ElectronService } from '../../providers/electron.service';
import { MarketService } from '../../providers/market.service';
import { ExchangesType } from '../../domains/service-types';
import { CurrencyPipe } from '@angular/common';
import Big from 'big.js';

@Component({
  selector: 'app-exchanges',
  templateUrl: './exchanges.component.html',
  styleUrls: ['./exchanges.component.scss']
})
export class ExchangesComponent implements OnInit {

  exchange_context_menu: ElectronMenu;
  selectedExchangeRow: ExchangesType;
  exchanges: Array<ExchangesType> = [];
  fiatValue = '0.00';
  coinSupply = '40000000000';
  marketCapital = '0.00';
  marketVolumeUSD = '0.00';
  visit_exchange_clicked = false;

  constructor(private logger: LogService,
              private electronService: ElectronService,
              private marketService: MarketService,
              private currencyPipe: CurrencyPipe ) {
    this.logger.debug('### INIT Exchanges ###');
    this.exchanges = this.marketService.exchanges;
  }

  ngOnInit() {
    // init exchanges context menu
    const exchanges_context_menu_template = [
      { label: 'Visit Exchange',
        click(menuItem, browserWindow, event) {
          browserWindow.webContents.send('exchanges-context-menu-event', 'visit-exchange');
        }
      }
    ];
    this.exchange_context_menu = this.electronService.remote.Menu.buildFromTemplate(exchanges_context_menu_template);

    // listen to address context menu events
    this.electronService.ipcRenderer.on('exchanges-context-menu-event', (event, arg) => {
      this.logger.debug('### Exchanges Menu Event: ' + arg);
      if (arg === 'visit-exchange') {
        this.visitExchange(this.selectedExchangeRow);
      } else {
        this.logger.debug('### Context menu not implemented: ' + arg);
      }
    });

    // listen to exchange updates
    this.marketService.exchangeUpdates.subscribe( result => {
      this.logger.debug('### Exchanges Update: ' + JSON.stringify(result));
      this.exchanges = result;
    });

    // update coininfo
    this.updateCoininfo();
    // listen to coininfo updates
    this.marketService.coininfoUpdates.subscribe( result => {
      this.updateCoininfo();
    });
  }

  updateCoininfo() {
    if (this.marketService.coinMarketInfo != null) {
      const coinFiat = this.marketService.coinMarketInfo.price_fiat ? this.marketService.coinMarketInfo.price_fiat : '0.00';
      const volumeUSD = this.marketService.coinMarketInfo.market_24h_volume_usd ? this.marketService.coinMarketInfo.market_24h_volume_usd : '0.00';
      this.logger.debug('### updateCoininfo - coinFiat: ' + coinFiat);
      const marketFiat = new Big(this.coinSupply).times(new Big(coinFiat)).toString();
      this.fiatValue = this.currencyPipe.transform(coinFiat, this.marketService.coinMarketInfo.selected_fiat, 'symbol', '1.2-6');
      this.marketCapital = this.currencyPipe.transform(marketFiat, this.marketService.coinMarketInfo.selected_fiat, 'symbol', '1.2-2');
      this.marketVolumeUSD = this.currencyPipe.transform(volumeUSD, this.marketService.coinMarketInfo.selected_fiat, 'symbol-narrow', '1.2-2');
    }
  }

  onExchangeContextMenu(event) {
    this.selectedExchangeRow = event.data;
    this.logger.debug('### onExchangeContextMenu: ' + JSON.stringify(this.selectedExchangeRow));
    this.exchange_context_menu.popup({window: this.electronService.remote.getCurrentWindow()});
  }

  onExchangeRowClick(event) {
    this.logger.debug('### onExchangeRowClick: ' + event.name);
    this.selectedExchangeRow = event;
    // if (this.visit_exchange_clicked) {
      // this.electronService.remote.shell.openExternal(this.selectedExchangeRow.tradeURL);
    // }
  }

  visitExchange(rowdata) {
    this.logger.debug('### visitExchange: ' + rowdata.name);
    this.electronService.remote.shell.openExternal(rowdata.tradeURL);
    return false;
  }

}
