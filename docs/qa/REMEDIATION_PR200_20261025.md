Remediation of seven isolated Django blocker finding IDs from draft PR #200 on frozen main b77e9fd2.

The original ten regression tests are copied without changing assertions. This draft fixes B06/B07/B15/B33/B36/F04-N2/F10-N5. Tests run on disposable Django SQLite; no application migrations, staging changes, deployment, or real Stripe charge. Other findings and full cross-platform acceptance remain outstanding.
