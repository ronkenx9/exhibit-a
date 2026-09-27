// Card-network evidence rules, per reason code. These are deterministic and
// never delegated to the model: the model maps exhibits to requirements, the
// code decides whether the requirement is met.
//
// Summarised from public Visa Dispute Management Guidelines / Compelling
// Evidence 3.0 and Mastercard Chargeback Guide categories. Not legal advice.

export const NETWORK_FEE = 15; // typical per-dispute fee a merchant pays, USD
export const SUCCESS_FEE = 0.15; // EXHIBIT A pricing: 15% of recovered funds, only on wins

export const RULES = {
  "visa:13.1": {
    network: "Visa",
    code: "13.1",
    label: "Merchandise / Services Not Received",
    deadlineDays: 30,
    requirements: [
      { key: "proof_of_delivery", label: "Carrier proof of delivery (delivered status + date)", required: true, weight: 35 },
      { key: "address_match", label: "Delivery address matches the address on the order", required: true, weight: 25 },
      { key: "customer_acknowledged", label: "Cardholder acknowledged receipt or used the goods", required: false, weight: 25 },
      { key: "order_details", label: "Order confirmation: item, amount, date", required: false, weight: 15 },
    ],
  },
  "visa:13.2": {
    network: "Visa",
    code: "13.2",
    label: "Cancelled Recurring Transaction",
    deadlineDays: 30,
    requirements: [
      { key: "terms_accepted", label: "Cardholder accepted recurring terms at signup", required: true, weight: 30 },
      { key: "no_cancellation", label: "No cancellation request received before the charge", required: true, weight: 30 },
      { key: "usage_after_charge", label: "Service used after the disputed billing date", required: false, weight: 30 },
      { key: "renewal_notice", label: "Renewal reminder sent before billing", required: false, weight: 10 },
    ],
  },
  "visa:13.3": {
    network: "Visa",
    code: "13.3",
    label: "Not as Described or Defective",
    deadlineDays: 30,
    requirements: [
      { key: "listing_matches", label: "Listing at time of purchase matches what was delivered", required: true, weight: 35 },
      { key: "no_return", label: "Cardholder did not attempt a return under the posted policy", required: true, weight: 30 },
      { key: "return_policy", label: "Return policy was disclosed at checkout", required: false, weight: 20 },
      { key: "customer_acknowledged", label: "Cardholder acknowledged the item works / as expected", required: false, weight: 15 },
    ],
  },
  "visa:10.4": {
    network: "Visa",
    code: "10.4",
    label: "Other Fraud — Card-Absent Environment",
    deadlineDays: 30,
    requirements: [
      { key: "prior_undisputed", label: "2+ prior undisputed transactions 120–365 days old (CE 3.0)", required: true, weight: 40 },
      { key: "identifier_match", label: "Current transaction shares 2 of: IP, device ID, shipping address, login (CE 3.0)", required: true, weight: 35 },
      { key: "avs_cvv_match", label: "AVS and CVV matched at authorization", required: false, weight: 15 },
      { key: "customer_acknowledged", label: "Account holder engaged with the order after purchase", required: false, weight: 10 },
    ],
  },
  "mastercard:4853": {
    network: "Mastercard",
    code: "4853",
    label: "Cardholder Dispute — Goods Not Provided",
    deadlineDays: 45,
    requirements: [
      { key: "proof_of_delivery", label: "Carrier proof of delivery (delivered status + date)", required: true, weight: 40 },
      { key: "address_match", label: "Delivery address matches the address on the order", required: true, weight: 25 },
      { key: "customer_acknowledged", label: "Cardholder acknowledged receipt or used the goods", required: false, weight: 20 },
      { key: "order_details", label: "Order confirmation: item, amount, date", required: false, weight: 15 },
    ],
  },
};

export function ruleFor(network, code) {
  return RULES[`${String(network).toLowerCase()}:${code}`] || null;
}

// Deterministic verdict from verified coverage. The model never decides this.
export function score(rule, coveredKeys, amount) {
  const covered = new Set(coveredKeys);
  let pts = 0;
  const missingRequired = [];
  for (const r of rule.requirements) {
    if (covered.has(r.key)) pts += r.weight;
    else if (r.required) missingRequired.push(r);
  }
  // Missing any required element caps the case: issuers reject incomplete
  // compelling evidence outright.
  const likelihood = missingRequired.length ? Math.min(pts, 25) : Math.min(95, 40 + pts * 0.55);
  const p = likelihood / 100;
  const expectedRecovery = amount * p;
  const expectedNet = expectedRecovery * (1 - SUCCESS_FEE) - NETWORK_FEE;
  const decision = missingRequired.length === 0 && expectedNet > 0 ? "FIGHT" : "ACCEPT";
  return {
    coverage: pts,
    likelihood: Math.round(likelihood),
    missingRequired: missingRequired.map((r) => r.key),
    expectedRecovery: round2(expectedRecovery),
    expectedNet: round2(expectedNet),
    fee: round2(amount * SUCCESS_FEE),
    networkFee: NETWORK_FEE,
    decision,
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
