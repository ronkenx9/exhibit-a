# SERV Hackathon Ed. 01 — submission kit

Track: **Open Track** (runs on SERV Reasoning)
Live demo: https://exhibit-a-pi.vercel.app
Repo: https://github.com/ronkenx9/exhibit-a
Video: demo/exhibit-a-demo.mp4 (upload natively to X)
Images: demo/00-hook.png, 01-cited-rebuttal.png, 02-quarantine.png, 03-accept-memo.png

## X post (attach video; images in reply)

EXHIBIT A — chargeback defense that can't make things up.

AI can write a dispute response in seconds. One invented fact and the issuer throws the whole thing out.

So EXHIBIT A has one rule: it can only argue from evidence it can quote.

Built on @openservai SERV Reasoning:
→ Kronos-audited prompt maps evidence to Visa/Mastercard rules
→ prompt guard + quarantine for AI-targeted text planted in evidence
→ shadow agent drafts a rebuttal where every sentence cites an exhibit
→ code verifies every quote, decides FIGHT/ACCEPT, lints every citation
→ exports straight to Stripe's dispute evidence fields

~1¢ of SERV per case. 15% of recovered funds, only on wins.

Live: https://exhibit-a-pi.vercel.app
Code: https://github.com/ronkenx9/exhibit-a

## Form answers

- Name: EXHIBIT A
- Concept: A chargeback-defense agent on SERV Reasoning that can only argue from evidence it can quote verbatim. SERV maps exhibits to card-network rules (Kronos + prompt guard + strict schema) and drafts the rebuttal under shadow-agent validation; deterministic code verifies every quote, decides fight vs. accept from coverage and economics, strikes uncited sentences, and exports a Stripe evidence object.
- Creativity: Treats evidence as adversarial (quarantines instructions planted for AI), and turns SERV's shadow agent into a citation-grounding gate. Tells merchants when NOT to fight.
- User-readiness: Live app, three sample disputes, create-your-own case, Stripe dispute JSON import, PDF packet, Stripe evidence JSON, per-call audit trail with cost.
- Revenue: 15% of recovered funds only on wins (market rate 20-30%); SERV cost ~$0.004-0.009 per case.

## Owner checklist

1. Data collection ON at console.openserv.ai/settings/organization (eligibility rule).
2. Post on X from your account with the video, tag @openservai.
3. Fill the submission form with the post link + fields above.
4. Deadline: Sep 28 00:00 UTC.
