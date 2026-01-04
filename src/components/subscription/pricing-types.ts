export interface PricingFeature {
    icon: React.ReactNode;
    text: string;
    highlighted?: boolean;
    disabled?: boolean;
}

export interface PricingTier {
    id: string;
    name: string;
    icon: React.ReactNode;
    iconColor?: string;
    description: string;
    price: number;
    features: PricingFeature[];
    popular?: boolean;
}
