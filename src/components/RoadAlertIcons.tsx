import type { SVGProps } from 'react';

// Pictogramas da situação real; evitam reutilizar o triângulo genérico de perigo.
type IconProps = SVGProps<SVGSVGElement> & { size?: number; strokeWidth?: number };

export function PotholeIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 3v18M19 3v18M12 3v4M12 18v3" />
    <path d="m5.8 12.1 2.7-1.1 1.6-2.1 3.4.7 1.7 1.5 3.1.5-2.1 2.6-3.4 1-2.4-1.2-2.6.4z" />
    <path d="m10.2 11.5 2.3 1.3 2.1-.6" strokeWidth="1.3" />
  </svg>;
}

export function PoliceOfficerIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7.5 9.5 8.7 5h6.6l1.2 4.5M5 10h14M7.5 10v2.5a4.5 4.5 0 0 0 9 0V10" />
    <path d="m12 6.4.65 1.1-.65 1.1-.65-1.1z" />
    <path d="M6.5 21v-1.7c0-2.2 2.4-3.6 5.5-3.6s5.5 1.4 5.5 3.6V21" />
  </svg>;
}

export function RobberyIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M7.2 9.3V8a4.8 4.8 0 0 1 9.6 0v1.3M8.2 15.1a4.4 4.4 0 0 0 7.6 0" />
    <path d="M5.8 9.5h12.4v4.2H5.8z" />
    <path d="M8.3 11.5h1.8m3.8 0h1.8" strokeWidth="2.3" />
    <path d="M5.5 21c0-2.7 2.7-4.7 6.5-4.7s6.5 2 6.5 4.7" />
  </svg>;
}

export function TollBoothIcon({size = 24, strokeWidth = 1.9, ...props}: IconProps) {
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 8h18M4.5 8V5.5h15V8M6 8v13M18 8v13M9 21v-8h6v8" />
    <path d="M3 13h6M15 13h6M9.5 5.5v-2h5v2" />
  </svg>;
}
