import { AppConstants } from './app-constants';

export interface CoinMarketCapType {
    id: string;
    name: string;
    symbol: string;
    rank?: string;
    price_usd?: string;
    price_btc?: string;
    price_fiat?: string;
    selected_fiat?: string;
    market_24h_volume_usd?: string;
    market_cap_usd?: string;
    available_supply?: string;
    total_supply?: string;
    max_supply?: string;
    percent_change_1h?: string;
    percent_change_24h?: string;
    percent_change_7d?: string;
    last_updated?: string;
}

export interface ExchangesType {
    _id: string;
    name: string;
    imageBase64: string;
    buy: number;
    sell: number;
    last: number;
    volume24H: number;
    endpoint: string;
    tradeURL: string;
    enabled: boolean;
    lastUpdateDate: string;
}
