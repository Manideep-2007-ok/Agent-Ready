// Class-name helper used by the Magic UI / shadcn components (clsx + tailwind-merge).
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
