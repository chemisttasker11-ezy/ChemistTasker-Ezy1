"""Give the constraints, indexes and identity sequences of the rewards tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_id_seq', 'rewards_pillledgerentry_id_seq'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pilll_referral_event_id_f3098242_fk_client_pr', 'rewards_pillledgeren_referral_event_id_0c2c2d2d_fk_rewards_p'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pilll_rule_id_64101b79_fk_client_pr', 'rewards_pillledgeren_rule_id_46d18c3c_fk_rewards_p'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pilll_shift_id_8995b84a_fk_client_pr', 'rewards_pillledgeren_shift_id_1ae78523_fk_client_pr'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pilll_user_id_967afe89_fk_users_use', 'rewards_pillledgerentry_user_id_90027937_fk_users_user_id'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_idempotency_key_key', 'rewards_pillledgerentry_idempotency_key_key'),
    ('constraint', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_pkey', 'rewards_pillledgerentry_pkey'),
    ('index', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_idempotency_key_59713b4b_like', 'rewards_pillledgerentry_idempotency_key_31dedee4_like'),
    ('index', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_referral_event_id_f3098242', 'rewards_pillledgerentry_referral_event_id_0c2c2d2d'),
    ('index', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_rule_id_64101b79', 'rewards_pillledgerentry_rule_id_46d18c3c'),
    ('index', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_shift_id_8995b84a', 'rewards_pillledgerentry_shift_id_1ae78523'),
    ('index', 'rewards_pillledgerentry', 'client_profile_pillledgerentry_user_id_967afe89', 'rewards_pillledgerentry_user_id_90027937'),
    ('sequence', 'rewards_pillreferralcode', 'client_profile_pillreferralcode_id_seq', 'rewards_pillreferralcode_id_seq'),
    ('constraint', 'rewards_pillreferralcode', 'client_profile_pillr_user_id_c7cf0c90_fk_users_use', 'rewards_pillreferralcode_user_id_9edb3954_fk_users_user_id'),
    ('constraint', 'rewards_pillreferralcode', 'client_profile_pillreferralcode_code_key', 'rewards_pillreferralcode_code_key'),
    ('constraint', 'rewards_pillreferralcode', 'client_profile_pillreferralcode_pkey', 'rewards_pillreferralcode_pkey'),
    ('constraint', 'rewards_pillreferralcode', 'client_profile_pillreferralcode_user_id_key', 'rewards_pillreferralcode_user_id_key'),
    ('index', 'rewards_pillreferralcode', 'client_profile_pillreferralcode_code_b52dd634_like', 'rewards_pillreferralcode_code_8b06dfe4_like'),
    ('sequence', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_id_seq', 'rewards_pillreferralevent_id_seq'),
    ('constraint', 'rewards_pillreferralevent', 'client_profile_pillr_referral_code_id_f5a10232_fk_client_pr', 'rewards_pillreferral_referral_code_id_e55e6684_fk_rewards_p'),
    ('constraint', 'rewards_pillreferralevent', 'client_profile_pillr_referred_user_id_dc8f6485_fk_users_use', 'rewards_pillreferral_referred_user_id_bf20aa6d_fk_users_use'),
    ('constraint', 'rewards_pillreferralevent', 'client_profile_pillr_referrer_id_ee04f428_fk_users_use', 'rewards_pillreferralevent_referrer_id_a0059c36_fk_users_user_id'),
    ('constraint', 'rewards_pillreferralevent', 'client_profile_pillr_shift_id_b9bf9707_fk_client_pr', 'rewards_pillreferral_shift_id_f83f5820_fk_client_pr'),
    ('constraint', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_pkey', 'rewards_pillreferralevent_pkey'),
    ('index', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_referral_code_id_f5a10232', 'rewards_pillreferralevent_referral_code_id_e55e6684'),
    ('index', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_referred_user_id_dc8f6485', 'rewards_pillreferralevent_referred_user_id_bf20aa6d'),
    ('index', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_referrer_id_ee04f428', 'rewards_pillreferralevent_referrer_id_a0059c36'),
    ('index', 'rewards_pillreferralevent', 'client_profile_pillreferralevent_shift_id_b9bf9707', 'rewards_pillreferralevent_shift_id_f83f5820'),
    ('sequence', 'rewards_pillrewardrule', 'client_profile_pillrewardrule_id_seq', 'rewards_pillrewardrule_id_seq'),
    ('constraint', 'rewards_pillrewardrule', 'client_profile_pillrewardrule_code_key', 'rewards_pillrewardrule_code_key'),
    ('constraint', 'rewards_pillrewardrule', 'client_profile_pillrewardrule_pill_amount_check', 'rewards_pillrewardrule_pill_amount_check'),
    ('constraint', 'rewards_pillrewardrule', 'client_profile_pillrewardrule_pkey', 'rewards_pillrewardrule_pkey'),
    ('index', 'rewards_pillrewardrule', 'client_profile_pillrewardrule_code_e2691891_like', 'rewards_pillrewardrule_code_9e5d2317_like'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('rewards', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
