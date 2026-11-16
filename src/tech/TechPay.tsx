import { useState } from 'react';
import { useApp } from '../store';
import { EarningsTracker, thisMonth } from '../components/Earnings';

/** The tech's own commissions & tips, sized for a phone. */
export function TechPay() {
  const app = useApp();
  const [month, setMonth] = useState(thisMonth);
  if (!app.currentUserId) return null;
  return (
    <div>
      <h1 className="mb-3 text-xl font-bold">My commissions & tips</h1>
      <EarningsTracker key={app.currentUserId} userId={app.currentUserId} month={month} onMonthChange={setMonth} compact />
    </div>
  );
}
