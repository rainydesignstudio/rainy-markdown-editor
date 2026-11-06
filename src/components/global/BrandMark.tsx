export function BrandMark() {
  // Preserve the application mark's geometry; fill follows the active editor theme.
  return <svg viewBox="0 0 32 32" aria-hidden="true">
    <path d="M10 0h16a6 6 0 0 1 6 6v16a10 10 0 0 1-10 10H6a6 6 0 0 1-6-6V10A10 10 0 0 1 10 0Z" className="fill-accent group-hover:fill-accent-strong group-focus-visible:fill-accent-strong" />
    <text x="16" y="22.5" className="fill-current" fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" fontSize="18" fontWeight="800" letterSpacing="-1.5" textAnchor="middle">R/</text>
  </svg>;
}
