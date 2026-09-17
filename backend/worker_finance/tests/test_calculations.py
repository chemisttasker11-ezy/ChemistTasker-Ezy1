from datetime import date, datetime
from decimal import Decimal
import unittest
from worker_finance.calculations import (
    CalculationError, allocate_payment, calculate_invoice, default_super_rate,
    expense_gst_credit, normalise_abn, shift_hours,
)


def line(**changes):
    return {'item_id': 1, 'category_code': 'ProfessionalServices', 'quantity': '8',
            'unit_price': '100', 'discount': '0', 'tax_code': 'GST',
            'super_eligible': True, **changes}


class CalculationTests(unittest.TestCase):
    def test_exclusive_gst_and_super_not_worker_revenue(self):
        result = calculate_invoice([line()], gst_registered=True, super_mode='separate')
        self.assertEqual((result['subtotal'], result['gst'], result['payable'], result['super']),
                         ('800.00', '80.00', '880.00', '96.00'))

    def test_inclusive(self):
        result = calculate_invoice([line(unit_price='110')], gst_registered=True,
                                   price_mode='inclusive', super_mode='summary')
        self.assertEqual(result['payable'], '880.00')
        self.assertEqual(result['super'], '96.00')

    def test_mixed_tax_and_eligibility(self):
        result = calculate_invoice([line(), line(item_id=2, category_code='Transportation',
                                    quantity='1', unit_price='110', super_eligible=False)],
                                   gst_registered=True, super_mode='summary')
        self.assertEqual(result['gst'], '91.00')
        self.assertEqual(result['super'], '96.00')

    def test_manual_super_not_counted_twice(self):
        result = calculate_invoice([line(), line(item_id=2, category_code='Superannuation',
            quantity='1', unit_price='96', tax_code='OUT_OF_SCOPE', super_eligible=False)],
            gst_registered=True, super_mode='separate')
        self.assertEqual(result['automatic_super'], '0.00')
        self.assertEqual(result['payable'], '880.00')
        self.assertEqual(result['sales_gross'], '880.00')
        self.assertEqual(result['super'], '96.00')

    def test_unregistered_cannot_charge_gst(self):
        with self.assertRaises(CalculationError):
            calculate_invoice([line()], gst_registered=False)

    def test_no_super_on_super(self):
        with self.assertRaises(CalculationError):
            calculate_invoice([line(category_code='Superannuation', tax_code='OUT_OF_SCOPE')],
                              gst_registered=True, super_mode='summary')

    def test_negative_nan_infinity_boolean_float_and_excess_precision(self):
        for value in ('-1', 'NaN', 'Infinity', True, 1.23, '1.234'):
            with self.subTest(value=value), self.assertRaises(CalculationError):
                calculate_invoice([line(quantity=value)], gst_registered=True)

    def test_discount_and_tax_codes(self):
        for code in ('GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE'):
            result = calculate_invoice([line(tax_code=code, discount='10')], gst_registered=True)
            self.assertEqual(result['gst'], '0.00')
            self.assertEqual(result['payable'], '720.00')
            self.assertEqual(result['sales_gross'], '0.00' if code == 'OUT_OF_SCOPE' else '720.00')

    def test_empty_and_missing_item(self):
        for lines in ([], [line(item_id=None)]):
            with self.assertRaises(CalculationError):
                calculate_invoice(lines, gst_registered=True)

    def test_rate_boundary(self):
        self.assertEqual(default_super_rate(date(2025, 6, 30)), Decimal('11.50'))
        self.assertEqual(default_super_rate(date(2025, 7, 1)), Decimal('12.00'))

    def test_overnight_and_dst(self):
        self.assertEqual(shift_hours(datetime.fromisoformat('2026-09-17T22:00:00+10:00'),
                                     datetime.fromisoformat('2026-09-18T06:00:00+10:00'), 30), Decimal('7.50'))
        self.assertEqual(shift_hours(datetime.fromisoformat('2026-10-04T00:00:00+10:00'),
                                     datetime.fromisoformat('2026-10-04T04:00:00+11:00')), Decimal('3.00'))
        with self.assertRaises(CalculationError):
            shift_hours(datetime(2026, 1, 1), datetime(2026, 1, 2))

    def test_payment_rounding(self):
        amounts = [allocate_payment(amount='1', previously_paid=str(i), total='3', component='1') for i in range(3)]
        self.assertEqual(sum(amounts), Decimal('1.00'))
        with self.assertRaises(CalculationError):
            allocate_payment(amount='4', previously_paid='0', total='3', component='1')

    def test_expense_credit(self):
        args = dict(amount='110', gst_amount='10', business_use_percent='60', tax_code='GST', gst_registered=True)
        self.assertEqual(expense_gst_credit(**args, evidence_confirmed=True), Decimal('6.00'))
        self.assertEqual(expense_gst_credit(**args, evidence_confirmed=False), Decimal('0.00'))

    def test_abn_checksum_not_registry_verification(self):
        self.assertEqual(normalise_abn('51 824 753 556'), '51824753556')
        with self.assertRaises(CalculationError):
            normalise_abn('12345678901')


if __name__ == '__main__':
    unittest.main()
