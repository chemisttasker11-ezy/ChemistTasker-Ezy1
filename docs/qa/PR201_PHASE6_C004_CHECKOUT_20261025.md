# PR201 C004-N2/B04 checkout scope

A checkout without an offer/slot/candidate selection may charge once while the webhook finalizes several offers. Require an explicit selector and compute Stripe units from the eligible selected set. Added four targeted positive/negative cases. Exact-head CI pending, no merge/deploy. NO-GO.
