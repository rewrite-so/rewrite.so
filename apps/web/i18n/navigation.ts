import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing.ts';

// next-intl 包装的 Link / redirect / usePathname / useRouter，自动带 locale 前缀。
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);
