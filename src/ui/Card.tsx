import type { ReactNode } from 'react';

export interface CardProps {
  as?: 'div' | 'section' | 'article' | 'aside';
  className?: string;
  children: ReactNode;
}

export function Card({ as: Tag = 'div', className, children }: CardProps) {
  return <Tag className={className ? `card ${className}` : 'card'}>{children}</Tag>;
}
