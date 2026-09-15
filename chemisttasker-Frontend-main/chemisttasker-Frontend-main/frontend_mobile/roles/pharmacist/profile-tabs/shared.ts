import * as DocumentPicker from 'expo-document-picker';

export type RoleKey = 'pharmacist';

export const roleKey: RoleKey = 'pharmacist';

export const DOC_TYPES = [
  { value: 'DRIVER_LICENSE', label: 'Driving license' },
  { value: 'VISA', label: 'Visa' },
  { value: 'AUS_PASSPORT', label: 'Australian Passport' },
  { value: 'OTHER_PASSPORT', label: 'Other Passport' },
  { value: 'AGE_PROOF', label: 'Age Proof Card' },
] as const;

export const AUS_STATES = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'];

export const REL_CHOICES = [
  { value: 'manager', label: 'Manager' },
  { value: 'supervisor', label: 'Supervisor' },
  { value: 'colleague', label: 'Colleague' },
  { value: 'owner', label: 'Owner' },
  { value: 'other', label: 'Other' },
];

export async function pickSingleDocument() {
  const res = await DocumentPicker.getDocumentAsync({
    multiple: false,
    copyToCacheDirectory: true,
    type: '*/*',
  });
  if (res.canceled || !res.assets?.length) return null;
  return res.assets[0];
}

export function toRNFile(asset: DocumentPicker.DocumentPickerAsset | null) {
  if (!asset?.uri) return null;
  return {
    uri: asset.uri,
    name: asset.name || `file-${Date.now()}`,
    type: asset.mimeType || 'application/octet-stream',
  } as any;
}

export function boolChipProps(ok?: boolean | null) {
  if (ok === true) {
    return { icon: 'check-circle-outline', text: 'Verified', color: '#16A34A' };
  }
  if (ok === false) {
    return { icon: 'close-circle-outline', text: 'Not Verified', color: '#DC2626' };
  }
  return { icon: 'clock-outline', text: 'Pending', color: '#6B7280' };
}

