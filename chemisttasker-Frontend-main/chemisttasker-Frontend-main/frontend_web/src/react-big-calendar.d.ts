declare module 'react-big-calendar';

declare module 'react-big-calendar/lib/utils/constants' {
  export const navigate: {
    PREVIOUS: string;
    NEXT: string;
    TODAY: string;
    DATE: string;
  };
}

declare module 'react-big-calendar/lib/TimeGrid' {
  import * as React from 'react';
  const TimeGrid: React.ComponentType<any>;
  export default TimeGrid;
}
