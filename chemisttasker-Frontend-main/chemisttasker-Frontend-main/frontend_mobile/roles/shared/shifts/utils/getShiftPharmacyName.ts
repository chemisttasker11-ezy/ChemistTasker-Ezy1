const getShiftPharmacyName = (shift: any) =>
  shift?.pharmacyName ||
  shift?.pharmacy_name ||
  shift?.pharmacyDetail?.name ||
  shift?.pharmacy_detail?.name ||
  shift?.pharmacy?.name ||
  shift?.pharmacy?.pharmacy_name ||
  shift?.pharmacy?.pharmacyName ||
  'Pharmacy';

export default getShiftPharmacyName;
