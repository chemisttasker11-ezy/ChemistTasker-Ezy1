import React from 'react';
import MapView, { Circle, Marker, PROVIDER_GOOGLE } from 'react-native-maps';

type Props = {
  latitude: number;
  longitude: number;
  radiusKm: number;
  style: any;
};

function buildNativeRegion(latitude: number, longitude: number, radiusKm: number) {
  const latDelta = Math.max(0.02, radiusKm / 55);
  const lngDelta = Math.max(0.02, radiusKm / (55 * Math.max(Math.cos((latitude * Math.PI) / 180), 0.2)));

  return {
    latitude,
    longitude,
    latitudeDelta: latDelta,
    longitudeDelta: lngDelta,
  };
}

export default function AvailabilityRadiusMap({ latitude, longitude, radiusKm, style }: Props) {
  const region = buildNativeRegion(latitude, longitude, radiusKm);

  return (
    <MapView provider={PROVIDER_GOOGLE} style={style} initialRegion={region} region={region}>
      <Marker coordinate={{ latitude, longitude }} />
      <Circle
        center={{ latitude, longitude }}
        radius={radiusKm * 1000}
        strokeColor="#4caf50"
        fillColor="rgba(76, 175, 80, 0.2)"
        strokeWidth={2}
      />
    </MapView>
  );
}
