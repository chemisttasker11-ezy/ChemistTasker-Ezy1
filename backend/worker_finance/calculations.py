"""Pure, Decimal-only invoice calculations. No database or UI dependencies.

Super is a contribution payable to a fund, never automatically worker revenue.
The GST worksheet intentionally does not calculate or lodge a complete BAS.
"""
from datetime import date, datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

CENT = Decimal('0.01')
ZERO = Decimal('0.00')
MAX_MONEY = Decimal('99999999.99')
TAX_CODES = ('GST', 'GST_FREE', 'INPUT_TAXED', 'OUT_OF_SCOPE')
SUPER_CATEGORY = 'Superannuation'


class CalculationError(ValueError):
    pass


def decimal_value(value, name, *, minimum=ZERO, maximum=MAX_MONEY):
    if isinstance(value, (bool, float)):
        raise CalculationError(f'{name} must be a decimal string, not a float or boolean.')
    try:
        result = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        raise CalculationError(f'{name} must be a valid decimal.') from None
    if not result.is_finite() or not minimum <= result <= maximum:
        raise CalculationError(f'{name} must be between {minimum} and {maximum}.')
    return result


def money(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def normalise_abn(value):
    digits = ''.join(str(value or '').split())
    if len(digits) != 11 or not digits.isascii() or not digits.isdigit():
        raise CalculationError('Enter an 11-digit ABN.')
    numbers = [int(d) for d in digits]
    numbers[0] -= 1
    weights = (10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19)
    if sum(n * w for n, w in zip(numbers, weights)) % 89:
        raise CalculationError('ABN checksum is invalid.')
    return digits


def default_super_rate(payment_date):
    """A default for an anticipated payment date, not an eligibility decision."""
    if payment_date >= date(2025, 7, 1):
        return Decimal('12.00')
    if payment_date >= date(2024, 7, 1):
        return Decimal('11.50')
    if payment_date >= date(2023, 7, 1):
        return Decimal('11.00')
    raise CalculationError('For payments before July 2023, enter a reviewed super rate.')


def shift_hours(start, end, break_minutes=0):
    """Use timezone-aware instants so overnight and DST shifts are unambiguous."""
    if not isinstance(start, datetime) or not isinstance(end, datetime):
        raise CalculationError('Shift start and end must be datetimes.')
    if start.utcoffset() is None or end.utcoffset() is None:
        raise CalculationError('Shift times must include a timezone offset.')
    seconds = Decimal(str((end.astimezone(timezone.utc) - start.astimezone(timezone.utc)).total_seconds()))
    breaks = decimal_value(break_minutes, 'Unpaid break', maximum=Decimal('1440'))
    if breaks != breaks.to_integral_value():
        raise CalculationError('Unpaid break must be whole minutes.')
    if not ZERO < seconds <= Decimal('86400') or breaks * 60 >= seconds:
        raise CalculationError('Shift must be 0-24 hours with a shorter unpaid break.')
    return money((seconds - breaks * 60) / Decimal('3600'))


def calculate_invoice(lines, *, gst_registered, price_mode='exclusive',
                      super_mode='none', super_rate='12.00'):
    if type(gst_registered) is not bool:
        raise CalculationError('GST registration must be true or false.')
    if price_mode not in ('exclusive', 'inclusive'):
        raise CalculationError('Choose GST-inclusive or GST-exclusive prices.')
    if super_mode not in ('none', 'summary', 'separate'):
        raise CalculationError('Choose no super, summary or separate super.')
    if not isinstance(lines, list) or not 1 <= len(lines) <= 100:
        raise CalculationError('An invoice needs between 1 and 100 saved items.')
    rate = decimal_value(super_rate, 'Super rate', maximum=Decimal('100'))
    calculated = []
    subtotal = gst = sales_gross = super_base = manual_super = ZERO
    has_manual_super = False
    for source in lines:
        if not isinstance(source, dict) or not source.get('item_id'):
            raise CalculationError('Every line must reference a saved item.')
        quantity = decimal_value(source.get('quantity'), 'Quantity', minimum=CENT, maximum=Decimal('9999.99'))
        price = decimal_value(source.get('unit_price'), 'Unit price')
        discount = decimal_value(source.get('discount', '0'), 'Discount', maximum=Decimal('100'))
        if any(value != money(value) for value in (quantity, price, discount)):
            raise CalculationError('Quantity, unit price and discount support two decimal places.')
        code = source.get('tax_code')
        if code not in TAX_CODES:
            raise CalculationError('Select a recognised tax treatment for every item.')
        if code == 'GST' and not gst_registered:
            raise CalculationError('GST cannot be charged by an unregistered issuer.')
        contribution = source.get('category_code') == SUPER_CATEGORY
        eligible = source.get('super_eligible', False)
        if type(eligible) is not bool:
            raise CalculationError('Super eligibility must be true or false.')
        if contribution and (code != 'OUT_OF_SCOPE' or eligible or super_mode == 'none'):
            raise CalculationError('Super items require a super mode, no GST and no super-on-super.')
        amount = money(quantity * price * (1 - discount / 100))
        if amount > MAX_MONEY:
            raise CalculationError('Line amount exceeds the supported invoice limit.')
        tax = money(amount / 11) if code == 'GST' and price_mode == 'inclusive' else (
            money(amount / 10) if code == 'GST' else ZERO)
        net = amount - tax if code == 'GST' and price_mode == 'inclusive' else amount
        gross = net + tax
        if contribution:
            has_manual_super = True
            manual_super += gross
        else:
            subtotal += net
            gst += tax
            if code != 'OUT_OF_SCOPE':
                sales_gross += gross
            if eligible:
                super_base += net
        calculated.append({**source, 'quantity': str(quantity), 'unit_price': str(price),
                           'discount': str(discount), 'net': str(net), 'gst': str(tax),
                           'gross': str(gross)})
    automatic_super = money(super_base * rate / 100) if super_mode != 'none' and not has_manual_super else ZERO
    super_total = manual_super + automatic_super
    payable = subtotal + gst
    if max(payable, super_total) > MAX_MONEY:
        raise CalculationError('Invoice exceeds the supported amount limit.')
    return {'lines': calculated, 'subtotal': str(subtotal), 'gst': str(gst),
            'payable': str(payable), 'sales_gross': str(sales_gross),
            'super': str(super_total), 'automatic_super': str(automatic_super)}


def allocate_payment(*, amount, previously_paid, total, component):
    """Cumulative pro-rata allocation makes the final receipt absorb rounding."""
    amount = decimal_value(amount, 'Payment', minimum=CENT)
    paid = decimal_value(previously_paid, 'Previously paid')
    total = decimal_value(total, 'Invoice total', minimum=CENT)
    component = decimal_value(component, 'Component', maximum=total)
    if paid + amount > total:
        raise CalculationError('Payment exceeds the outstanding balance.')
    return money(component * (paid + amount) / total) - money(component * paid / total)


def expense_gst_credit(*, amount, gst_amount, business_use_percent,
                       tax_code, evidence_confirmed, gst_registered):
    amount = decimal_value(amount, 'Expense amount', minimum=CENT)
    gst = decimal_value(gst_amount, 'GST amount', maximum=amount)
    use = decimal_value(business_use_percent, 'Business use', maximum=Decimal('100'))
    if tax_code not in TAX_CODES:
        raise CalculationError('Select a recognised tax treatment.')
    if tax_code != 'GST' and gst:
        raise CalculationError('Only GST-coded purchases may contain a GST amount.')
    if gst > money(amount / 11):
        raise CalculationError('GST exceeds one-eleventh of the tax-inclusive expense.')
    if not gst_registered or tax_code != 'GST' or (amount > Decimal('82.50') and not evidence_confirmed):
        return ZERO
    return money(gst * use / 100)
