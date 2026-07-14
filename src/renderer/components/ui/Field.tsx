import type { ReactNode } from "react";

export function Field({
  label,
  required = true,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      <span className="field-control">{children}</span>
    </label>
  );
}
