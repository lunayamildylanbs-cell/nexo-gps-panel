export default function Icono({ nombre, tamano = 20 }) {
  const props = {
    width: tamano,
    height: tamano,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  };

  switch (nombre) {
    case 'pin':
      return (
        <svg {...props}>
          <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case 'search':
      return (
        <svg {...props}>
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4-4" />
        </svg>
      );
    case 'sun':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
        </svg>
      );
    case 'moon':
      return (
        <svg {...props}>
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5 8.5 8.5 0 1 0 20.5 14.5Z" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...props}>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M5.6 9A7 7 0 0 1 17.3 6L20 12M4 12l2.7 6A7 7 0 0 0 18.4 15" />
        </svg>
      );
    case 'logout':
      return (
        <svg {...props}>
          <path d="M10 17l5-5-5-5M15 12H3" />
          <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
        </svg>
      );
    case 'device':
      return (
        <svg {...props}>
          <rect x="6" y="2" width="12" height="20" rx="2" />
          <path d="M10 18h4" />
        </svg>
      );
    case 'fence':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
    case 'history':
      return (
        <svg {...props}>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5M12 7v5l3 2" />
        </svg>
      );
    case 'chevron':
      return (
        <svg {...props}>
          <path d="m9 18 6-6-6-6" />
        </svg>
      );
    case 'crosshair':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="7" />
          <circle cx="12" cy="12" r="2" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        </svg>
      );
    case 'shape-circle':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
    case 'shape-rectangle':
      return (
        <svg {...props}>
          <rect x="4" y="5" width="16" height="14" rx="1" />
        </svg>
      );
    case 'shape-polygon':
      return (
        <svg {...props}>
          <path d="m12 3 8 6-3 11H7L4 9l8-6Z" />
        </svg>
      );
    case 'shape-line':
      return (
        <svg {...props}>
          <path d="M4 18 20 6" />
          <circle cx="4" cy="18" r="1.5" />
          <circle cx="20" cy="6" r="1.5" />
        </svg>
      );
    case 'close':
      return (
        <svg {...props}>
          <path d="m18 6-12 12M6 6l12 12" />
        </svg>
      );
    default:
      return null;
  }
}