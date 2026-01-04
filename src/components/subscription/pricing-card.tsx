import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PricingTier } from "./pricing-types";

interface PricingCardProps {
  tier: PricingTier;
  currentTier: string;
  onUpgrade?: () => void;
  showActions?: boolean;
}

export function PricingCard({ tier, currentTier, onUpgrade, showActions = true }: PricingCardProps) {
  const isCurrentTier = tier.id === currentTier;
  const isFree = tier.id === "free";
  const isLifetime = tier.id === "lifetime";
  const isYearly = tier.id === "yearly";
  const hasLifetimePlan = currentTier === "lifetime";

  const getButtonText = () => {
    if (!showActions) return null;
    if (isCurrentTier && !isFree) return "Manage Subscription";
    if (isCurrentTier && isFree) return "Current Plan";
    if (isFree) return "Downgrade to Free";
    return `Upgrade to ${tier.name}`;
  };

  const getButtonVariant = () => {
    return isCurrentTier ? "outline" : "default";
  };

  const getBillingText = () => {
    if (isFree) return "forever";
    if (isLifetime) return "One-time payment";
    return isYearly ? "Billed yearly" : "Billed monthly";
  };

  return (
    <Card className={`relative flex flex-col h-full`}>
      {tier.popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <Badge className="bg-primary text-primary-foreground">Most Popular</Badge>
        </div>
      )}
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {tier.icon}
            <CardTitle>{tier.name}</CardTitle>
          </div>
          {isCurrentTier && showActions && <Badge variant="secondary">Current</Badge>}
        </div>
        <CardDescription className="min-h-10">{tier.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col">
        <div className="mb-4 min-h-18">
          <div className="text-3xl font-bold">{isFree ? "Free" : "$" + tier.price.toFixed(2)}</div>
          <div className="text-sm text-muted-foreground">{getBillingText()}</div>
        </div>
        <ul className="space-y-3 mb-6 flex-1">
          {tier.features.map((feature, index) => (
            <li key={index} className={`flex items-center gap-2 ${feature.disabled ? "opacity-50" : ""}`}>
              {feature.icon}
              <span className={`text-sm ${feature.highlighted ? "font-medium" : ""}`}>
                {feature.text}
                {feature.disabled && feature.highlighted && (
                  <Badge className="ml-2" variant="secondary">
                    Coming Soon
                  </Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
        {showActions && onUpgrade && (
          <Button
            className="w-full"
            variant={getButtonVariant()}
            disabled={(isCurrentTier && isFree) || (hasLifetimePlan && !isCurrentTier)}
            onClick={onUpgrade}
          >
            {getButtonText()}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
