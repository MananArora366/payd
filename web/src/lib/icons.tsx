import React from 'react';
import {
  UtensilsCrossed,
  ShoppingCart,
  Car,
  ShoppingBag,
  Film,
  Home,
  Zap,
  HeartPulse,
  GraduationCap,
  Plane,
  Repeat,
  MoreHorizontal,
  CreditCard,
  Banknote,
  Smartphone,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
  Wallet,
  Tag,
} from 'lucide-react';

export function getCategoryIcon(iconName?: string | null, className = 'w-4 h-4') {
  switch (iconName) {
    case 'UtensilsCrossed':
      return <UtensilsCrossed className={className} />;
    case 'ShoppingCart':
      return <ShoppingCart className={className} />;
    case 'Car':
      return <Car className={className} />;
    case 'ShoppingBag':
      return <ShoppingBag className={className} />;
    case 'Film':
      return <Film className={className} />;
    case 'Home':
      return <Home className={className} />;
    case 'Zap':
      return <Zap className={className} />;
    case 'HeartPulse':
      return <HeartPulse className={className} />;
    case 'GraduationCap':
      return <GraduationCap className={className} />;
    case 'Plane':
      return <Plane className={className} />;
    case 'Repeat':
      return <Repeat className={className} />;
    default:
      return <Tag className={className} />;
  }
}

export function getPaymentMethodIcon(method?: string, className = 'w-4 h-4') {
  const m = (method || '').toLowerCase();
  if (m.includes('card') || m.includes('visa') || m.includes('mastercard')) {
    return <CreditCard className={className} />;
  }
  if (m.includes('apple') || m.includes('google') || m.includes('phone') || m.includes('pay')) {
    return <Smartphone className={className} />;
  }
  if (m.includes('bank') || m.includes('transfer') || m.includes('wire')) {
    return <ArrowUpRight className={className} />;
  }
  return <Banknote className={className} />;
}
