"""Give the ratings tables and indexes clean names. This is the only DDL of the move: ALTER TABLE ... RENAME and ALTER INDEX ... RENAME (metadata operations, no data is rewritten).
It runs after client_profile released the models and every other app re-pointed its relations, so no table is renamed
while another migration still has to create a foreign key to the old table name."""
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('ratings', '0001_initial'),
        ('client_profile', '0062_move_ratings_out'),
    ]

    operations = [
        migrations.RenameIndex(
            model_name='rating',
            new_name='ratings_rat_directi_9d360e_idx',
            old_name='client_prof_directi_97a2f4_idx',
        ),
        migrations.RenameIndex(
            model_name='rating',
            new_name='ratings_rat_directi_944cce_idx',
            old_name='client_prof_directi_c6efd6_idx',
        ),
        migrations.RenameIndex(
            model_name='rating',
            new_name='ratings_rat_directi_db6438_idx',
            old_name='client_prof_directi_de7840_idx',
        ),
        migrations.AlterModelTable(
            name='rating',
            table=None,
        ),
        migrations.AlterModelTable(
            name='ratingreport',
            table=None,
        ),
    ]
