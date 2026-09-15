import React from 'react';
import { Platform } from 'react-native';

type Props = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  style: any;
};

const AvailabilityRadiusMapImpl =
  Platform.OS === 'web'
    ? require('./AvailabilityRadiusMap.web').default
    : require('./AvailabilityRadiusMap.native').default;

export default function AvailabilityRadiusMap(props: Props) {
  return <AvailabilityRadiusMapImpl {...props} />;
}
