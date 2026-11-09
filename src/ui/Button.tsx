import type { MouseEventHandler, ReactNode } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'link';

export interface ButtonProps {
  variant?: ButtonVariant;
  /** Show the right arrow after the label. */
  arrow?: boolean;
  /** When set, the button renders as an `<a>`. */
  href?: string;
  onClick?: MouseEventHandler<HTMLElement>;
  type?: 'button' | 'submit' | 'reset';
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}

function ArrowIcon() {
  return (
    <svg
      className="btn-arrow"
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}

export function Button({
  variant = 'primary',
  arrow = false,
  href,
  onClick,
  type = 'button',
  disabled = false,
  className,
  'aria-label': ariaLabel,
  children,
}: ButtonProps) {
  const classes = ['btn', `btn-${variant}`, className].filter(Boolean).join(' ');
  const content = (
    <>
      {children}
      {arrow ? <ArrowIcon /> : null}
    </>
  );

  if (href !== undefined) {
    return (
      <a className={classes} href={href} onClick={onClick} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  return (
    <button className={classes} type={type} onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
      {content}
    </button>
  );
}
