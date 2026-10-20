/** Marque Kaiju — empreinte géométrique inspirée d'une créature géante, en vert de marque. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="Kaiju"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--kj-color-brand)" />
      {/* silhouette stylisée : crête + œil */}
      <path
        d="M9 22V13l3 3 4-6 4 6 3-3v9z"
        fill="var(--kj-color-brand-contrast)"
        opacity="0.92"
      />
      <circle cx="13" cy="19" r="1.4" fill="var(--kj-color-brand)" />
      <circle cx="19" cy="19" r="1.4" fill="var(--kj-color-brand)" />
    </svg>
  );
}
