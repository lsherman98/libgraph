import type { SubscriptionType } from "@/lib/api/api";
import { PricingCard } from "./pricing-card";
import { pricingTiers } from "./pricing-data";

interface PricingPlansProps {
  currentTier?: string;
  onUpgrade?: (planId: SubscriptionType | "free") => void;
  showActions?: boolean;
}

export function PricingPlans({ currentTier = "free", onUpgrade, showActions = true }: PricingPlansProps) {
  return (
    <div className="grid lg:grid-cols-2 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
      {pricingTiers.map((tier) => (
        <PricingCard
          key={tier.id}
          tier={tier}
          currentTier={currentTier}
          onUpgrade={() => (onUpgrade ? onUpgrade(tier.id as SubscriptionType) : null)}
          showActions={showActions}
        />
      ))}
    </div>
  );
}
