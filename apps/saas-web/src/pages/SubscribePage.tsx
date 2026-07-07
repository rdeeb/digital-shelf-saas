import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import type {
  BillingCycle,
  BillingPlan,
  BillingPlanId,
  BillingPlansResponse,
  PaypalSubscribeResponse,
} from '../api/types';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

type SubscribePayload = {
  planId: BillingPlanId;
  billingCycle: BillingCycle;
};

export function buildPaypalSubscribePayload(
  planId: BillingPlanId,
  billingCycle: BillingCycle,
): SubscribePayload {
  return { planId, billingCycle };
}

function planDescription(plan: BillingPlan): string {
  if (plan.deviceLimit === null) return 'Unlimited devices';
  if (plan.deviceLimit === 1) return '1 device';
  return `${plan.deviceLimit} devices`;
}

export function getSubscribeStatusMessage(status: string | null): string | null {
  if (status === 'success') {
    return 'PayPal approved your subscription. Refreshing account status may take a moment.';
  }
  if (status === 'cancel') return 'PayPal checkout was cancelled.';
  return null;
}

export function SubscribePage() {
  const [searchParams] = useSearchParams();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [salesFlags, setSalesFlags] = useState<BillingPlansResponse['salesFlags'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyPlanId, setBusyPlanId] = useState<BillingPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiGet<BillingPlansResponse>('/billing/plans');
        if (!cancelled) {
          setPlans(data.plans);
          setSalesFlags(data.salesFlags);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load plans.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function startPaypal(planId: BillingPlanId) {
    setBusyPlanId(planId);
    setError(null);
    try {
      const result = await apiPost<PaypalSubscribeResponse>(
        '/billing/paypal/subscribe',
        buildPaypalSubscribePayload(planId, billingCycle),
      );
      window.location.href = result.approvalUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start PayPal checkout.');
    } finally {
      setBusyPlanId(null);
    }
  }

  const newSalesDisabled = salesFlags?.newEnabled === false;
  const statusMessage = getSubscribeStatusMessage(searchParams.get('status'));

  return (
    <section className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Subscribe</h1>
        <p className="mt-1 text-sm text-neutral-600">
          Choose a plan to enable your library and devices.
        </p>
      </div>

      {error ? <Banner tone="error" message={error} /> : null}
      {statusMessage ? <Banner tone="info" message={statusMessage} /> : null}

      <div className="inline-flex rounded border border-neutral-300 bg-white p-1">
        {(['monthly', 'annual'] as const).map((cycle) => (
          <button
            key={cycle}
            type="button"
            onClick={() => setBillingCycle(cycle)}
            className={`rounded px-4 py-2 text-sm font-medium ${
              billingCycle === cycle ? 'bg-neutral-900 text-white' : 'text-neutral-700 hover:bg-neutral-100'
            }`}
          >
            {cycle === 'monthly' ? 'Monthly' : 'Annual'}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading plans...</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="rounded border border-neutral-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{plan.name}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{planDescription(plan)}</p>
                </div>
                <span className="rounded bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
                  {billingCycle}
                </span>
              </div>
              <Button
                className="mt-6 w-full"
                disabled={newSalesDisabled || busyPlanId !== null}
                onClick={() => void startPaypal(plan.id)}
              >
                {busyPlanId === plan.id ? 'Opening PayPal...' : 'Subscribe with PayPal'}
              </Button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
