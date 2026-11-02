"""Billing HTTP adapters cannot regain provider writes; workflow imports remain acyclic."""
import ast
from contextlib import ExitStack
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from django.test import SimpleTestCase

from billing import views, webhooks


class BillingWorkflowOwnershipContracts(SimpleTestCase):
    def test_http_adapters_do_not_write_or_open_payment_transactions(self):
        source = Path(views.__file__).read_text()
        forbidden = {'save', 'update', 'delete', 'create', 'get_or_create', 'bulk_create', 'bulk_update', 'atomic'}
        calls = [n for n in ast.walk(ast.parse(source)) if isinstance(n, ast.Call)]
        self.assertEqual([n.func.attr for n in calls if isinstance(n.func, ast.Attribute) and n.func.attr in forbidden], [])
        self.assertFalse(any(isinstance(n.func, ast.Attribute) and ast.unparse(n.func).startswith('stripe.') for n in calls))

    def test_billing_runtime_module_dependencies_are_acyclic(self):
        root = Path(views.__file__).parent
        files = {p.stem: p for p in root.glob('*.py') if not p.stem.startswith('test')}
        edges = {name: set() for name in files}
        for name, path in files.items():
            for node in ast.walk(ast.parse(path.read_text())):
                if isinstance(node, ast.ImportFrom):
                    if node.level == 1:
                        targets = [node.module.split('.')[0]] if node.module else [a.name.split('.')[0] for a in node.names]
                    elif node.module and node.module.startswith('billing.'):
                        targets = [node.module.split('.')[1]]
                    else:
                        targets = []
                    edges[name].update(t for t in targets if t in files)
                elif isinstance(node, ast.Import):
                    edges[name].update(a.name.split('.')[1] for a in node.names if a.name.startswith('billing.') and a.name.split('.')[1] in files)
        def visit(name, path):
            self.assertNotIn(name, path, f"Billing module cycle: {path + [name]}")
            for child in edges[name]:
                visit(child, path + [name])
        for name in edges:
            visit(name, [])
        self.assertTrue({'subscription_operations', 'shift_payments', 'webhooks'} <= edges['views'])
        self.assertTrue({'subscription_events', 'payment_events'} <= edges['webhooks'])

    def test_dispatch_keeps_subscription_payment_and_refund_paths_distinct(self):
        names = ['handle_subscription_checkout', 'handle_payment_checkout', 'handle_subscription_updated',
                 'handle_invoice_paid', 'handle_charge_refunded', 'handle_subscription_deleted']
        class Session(dict):
            __getattr__ = dict.__getitem__
        cases = [
            ('checkout.session.completed', Session(mode='subscription', metadata={'subscription_kind': 'extra_seats'}), names[0]),
            ('checkout.session.completed', Session(mode='payment', payment_status='paid'), names[1]),
            ('checkout.session.completed', Session(mode='payment', payment_status='unpaid'), None),
            ('checkout.session.completed', Session(mode='setup'), None),
            ('customer.subscription.updated', {}, names[2]),
            ('invoice.paid', {}, names[3]),
            ('charge.refunded', {}, names[4]),
            ('customer.subscription.deleted', {}, names[5]),
            ('unhandled.event', {}, None),
        ]
        for kind, obj, expected in cases:
            with self.subTest(kind=kind, mode=obj.get('mode')), ExitStack() as stack:
                handlers = {name: stack.enter_context(patch.object(webhooks, name)) for name in names}
                event = SimpleNamespace(type=kind, data=SimpleNamespace(object=obj))
                webhooks._process_stripe_event(event)
                self.assertEqual([name for name, handler in handlers.items() if handler.called], [expected] if expected else [])
                if expected:
                    handlers[expected].assert_called_once()
