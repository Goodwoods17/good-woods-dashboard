export function PageHeader({
  title,
  subtitle,
  eyebrow,
  actions,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="px-8 pt-7 pb-5 flex items-end justify-between gap-6">
      <div className="min-w-0">
        {eyebrow && (
          <div className="text-[11px] uppercase tracking-[0.06em] text-text-tertiary mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-[28px] leading-[34px] font-medium text-text-primary truncate tracking-[-0.02em]">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-text-secondary mt-1.5">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </header>
  );
}
