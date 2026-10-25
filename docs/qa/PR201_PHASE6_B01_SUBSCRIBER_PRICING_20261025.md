# PR201 B01 fulfillment subscriber discount remediation

The backend calculated active subscriber status but always used standard Stripe price IDs. Updated LOCUM and FULL_TIME/PART_TIME fee selection for the **resolved pharmacy billing account**, preserving standard charges when inactive or not subscribed. Contract tests mock checkout and verify expected price IDs, quantities and unrelated-account isolation. Provider-side price amounts still require catalogue verification.

Status: committed pending exact-head CI. No migration, deploy, merge, or audit PR changes. Release NO-GO.
