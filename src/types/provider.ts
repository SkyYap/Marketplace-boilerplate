export interface ProviderSelectors {
    username: string;
    password: string;
    submit: string;
    balance: string;
}

export interface ProviderConfig {
    name: string;
    login_url: string;
    dashboard_url: string;
    item_type: 'AIRMILES' | 'GIFT_CARD' | 'API_KEY';
    selectors: ProviderSelectors;
}

export interface ProviderRegistry {
    [key: string]: ProviderConfig;
}
