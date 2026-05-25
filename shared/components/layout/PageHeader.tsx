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
          <div className="text-label uppercase text-text-tertiary mb-2">
            {eyebrow}
          </div>
        )}
        <h1 className="font-serif text-headline font-medium text-text-primary truncate">
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
