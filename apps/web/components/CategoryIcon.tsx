// Monochrome line icons per node category (#38). Kept simple and premium; the
// designer can swap in her own set later.

const PATHS: Record<string, React.ReactNode> = {
  monnify: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
      <path d="M2.5 9.5h19" />
    </>
  ),
  safety: <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />,
  event: <path d="M13 2L4.5 13H11l-1 9 8.5-11H12l1-9z" />,
  control: (
    <>
      <circle cx="6" cy="6" r="2.2" />
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="12" r="2.2" />
      <path d="M6 8.2v7.6M8 6h4.5a3 3 0 0 1 3 3v.8M8 18h4.5a3 3 0 0 0 3-3v-.8" />
    </>
  ),
  app: (
    <>
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
      <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
    </>
  ),
};

export function CategoryIcon({ category, color }: { category: string; color: string }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[category] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}
