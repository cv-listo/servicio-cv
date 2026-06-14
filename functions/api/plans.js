import { formatPrice, getPlans, json } from "./_utils.js";

export async function onRequestGet({ env }) {
  const plans = getPlans(env);
  return json({
    ok: true,
    plans: Object.fromEntries(
      Object.entries(plans).map(([key, plan]) => [
        key,
        {
          ...plan,
          price: formatPrice(plan.amount),
        },
      ])
    ),
  });
}
