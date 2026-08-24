import { useState, useEffect } from 'react';

export type DeviceClass = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  deviceClass: DeviceClass;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isTouch: boolean;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
}

export function useDeviceClass(): DeviceInfo {
  const getDeviceInfo = (): DeviceInfo => {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const height = typeof window !== 'undefined' ? window.innerHeight : 768;
    const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
    const orientation = width >= height ? 'landscape' : 'portrait';

    let deviceClass: DeviceClass = 'desktop';
    if (width < 768) {
      deviceClass = 'mobile';
    } else if (width >= 768 && width < 1024) {
      deviceClass = 'tablet';
    } else {
      deviceClass = 'desktop';
    }

    return {
      deviceClass,
      isMobile: deviceClass === 'mobile',
      isTablet: deviceClass === 'tablet',
      isDesktop: deviceClass === 'desktop',
      isTouch,
      width,
      height,
      orientation
    };
  };

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>(getDeviceInfo);

  useEffect(() => {
    const handleResize = () => {
      setDeviceInfo(getDeviceInfo());
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return deviceInfo;
}
