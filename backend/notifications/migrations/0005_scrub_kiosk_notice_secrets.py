from django.db import migrations


def scrub_kiosk_notices(apps, schema_editor):
    notification = apps.get_model('notifications', 'Notification')
    notification.objects.using(schema_editor.connection.alias).filter(title='Kiosk Terminal Pairing Code').update(
        body='A kiosk pairing code is ready.', action_url='/kiosk-link?source=kiosk', payload={})
    notification.objects.using(schema_editor.connection.alias).filter(title='Kiosk PIN Setup Code').update(
        body='Your PIN code is ready.', action_url='/attendance-pin?show_setup_code=1', payload={})


class Migration(migrations.Migration):
    dependencies = [('notifications', '0004_notificationpushpreference')]
    operations = [migrations.RunPython(scrub_kiosk_notices, migrations.RunPython.noop)]
