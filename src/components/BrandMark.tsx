export function BrandMark() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="brand-symbol"
      fill="none"
    >
      <path
        d="M24 6.5c-8.84 0-16 7.16-16 16 0 12.1 16 22 16 22s16-9.9 16-22c0-8.84-7.16-16-16-16Z"
        className="brand-symbol__pin"
      />
      <circle cx="24" cy="22.5" r="2.8" className="brand-symbol__dot" />
      <path
        d="M24 13.5a9 9 0 0 1 9 9M24 17.5a5 5 0 0 1 5 5M24 31.5a9 9 0 0 1-9-9M24 27.5a5 5 0 0 1-5-5"
        className="brand-symbol__signal"
      />
    </svg>
  );
}
