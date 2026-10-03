"""Give the constraints, indexes and identity sequences of the chat tables the names a new database gets.

The tables were created as client_profile_* and renamed by 0002_clean_table_and_index_names;
PostgreSQL kept the names of the objects attached to them. Database only: no table, column or row changes, and
the migration state is unchanged. See core.migration_operations.RenameDatabaseNames."""
from django.db import migrations

from core.migration_operations import RenameDatabaseNames

# (kind, table, old name, new name)
RENAMES = [
    ('sequence', 'chat_conversation', 'client_profile_conversation_id_seq', 'chat_conversation_id_seq'),
    ('constraint', 'chat_conversation', 'client_profile_conve_created_by_id_cf3a0d18_fk_users_use', 'chat_conversation_created_by_id_615454ae_fk_users_user_id'),
    ('constraint', 'chat_conversation', 'client_profile_conve_pharmacy_id_865e1ff6_fk_client_pr', 'chat_conversation_pharmacy_id_6e32d58b_fk_client_pr'),
    ('constraint', 'chat_conversation', 'client_profile_conve_pinned_message_id_72dab51b_fk_client_pr', 'chat_conversation_pinned_message_id_536c90ed_fk_chat_message_id'),
    ('constraint', 'chat_conversation', 'client_profile_conversation_pkey', 'chat_conversation_pkey'),
    ('index', 'chat_conversation', 'client_profile_conversation_created_by_id_cf3a0d18', 'chat_conversation_created_by_id_615454ae'),
    ('index', 'chat_conversation', 'client_profile_conversation_dm_key_1802f343', 'chat_conversation_dm_key_40cdf064'),
    ('index', 'chat_conversation', 'client_profile_conversation_dm_key_1802f343_like', 'chat_conversation_dm_key_40cdf064_like'),
    ('index', 'chat_conversation', 'client_profile_conversation_pharmacy_id_865e1ff6', 'chat_conversation_pharmacy_id_6e32d58b'),
    ('index', 'chat_conversation', 'client_profile_conversation_pinned_message_id_72dab51b', 'chat_conversation_pinned_message_id_536c90ed'),
    ('sequence', 'chat_message', 'client_profile_message_id_seq', 'chat_message_id_seq'),
    ('constraint', 'chat_message', 'client_profile_messa_conversation_id_edf1780d_fk_client_pr', 'chat_message_conversation_id_a1207bf4_fk_chat_conversation_id'),
    ('constraint', 'chat_message', 'client_profile_messa_sender_id_65fe8784_fk_client_pr', 'chat_message_sender_id_991c686c_fk_client_profile_membership_id'),
    ('constraint', 'chat_message', 'client_profile_message_pkey', 'chat_message_pkey'),
    ('index', 'chat_message', 'client_profile_message_conversation_id_edf1780d', 'chat_message_conversation_id_a1207bf4'),
    ('index', 'chat_message', 'client_profile_message_sender_id_65fe8784', 'chat_message_sender_id_991c686c'),
    ('sequence', 'chat_messagereaction', 'client_profile_messagereaction_id_seq', 'chat_messagereaction_id_seq'),
    ('constraint', 'chat_messagereaction', 'client_profile_messa_message_id_242444b7_fk_client_pr', 'chat_messagereaction_message_id_ce403450_fk_chat_message_id'),
    ('constraint', 'chat_messagereaction', 'client_profile_messa_user_id_b37174cb_fk_users_use', 'chat_messagereaction_user_id_2772da4b_fk_users_user_id'),
    ('constraint', 'chat_messagereaction', 'client_profile_messagere_message_id_user_id_react_5910918b_uniq', 'chat_messagereaction_message_id_user_id_reaction_01c42647_uniq'),
    ('constraint', 'chat_messagereaction', 'client_profile_messagereaction_pkey', 'chat_messagereaction_pkey'),
    ('index', 'chat_messagereaction', 'client_profile_messagereaction_message_id_242444b7', 'chat_messagereaction_message_id_ce403450'),
    ('index', 'chat_messagereaction', 'client_profile_messagereaction_user_id_b37174cb', 'chat_messagereaction_user_id_2772da4b'),
    ('sequence', 'chat_participant', 'client_profile_participant_id_seq', 'chat_participant_id_seq'),
    ('constraint', 'chat_participant', 'client_profile_parti_conversation_id_0a8fe918_fk_client_pr', 'chat_participant_conversation_id_568ba5d5_fk_chat_conv'),
    ('constraint', 'chat_participant', 'client_profile_parti_membership_id_0cedac66_fk_client_pr', 'chat_participant_membership_id_8621a8b8_fk_client_pr'),
    ('constraint', 'chat_participant', 'client_profile_parti_pinned_message_id_f9967b37_fk_client_pr', 'chat_participant_pinned_message_id_5dd9f57d_fk_chat_message_id'),
    ('constraint', 'chat_participant', 'client_profile_participa_conversation_id_membersh_35a6cd25_uniq', 'chat_participant_conversation_id_membership_id_b908edd0_uniq'),
    ('constraint', 'chat_participant', 'client_profile_participant_pkey', 'chat_participant_pkey'),
    ('index', 'chat_participant', 'client_profile_participant_conversation_id_0a8fe918', 'chat_participant_conversation_id_568ba5d5'),
    ('index', 'chat_participant', 'client_profile_participant_membership_id_0cedac66', 'chat_participant_membership_id_8621a8b8'),
    ('index', 'chat_participant', 'client_profile_participant_pinned_message_id_f9967b37', 'chat_participant_pinned_message_id_5dd9f57d'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('chat', '0002_clean_table_and_index_names'),
    ]

    operations = [
        RenameDatabaseNames(RENAMES),
    ]
