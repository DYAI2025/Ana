import Link from "next/link";
import type { ComponentPropsWithRef, ReactNode } from "react";
import styles from "./ui.module.css";

type Variant = "primary" | "secondary" | "quiet";

interface CommonProps {
  variant?: Variant;
  icon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
  className?: string;
}

const classes = (variant: Variant, className?: string) =>
  [styles.button, styles[variant], className].filter(Boolean).join(" ");

export function Button({ variant = "secondary", icon, trailingIcon, children, className, type = "button", ...rest }: CommonProps & Omit<ComponentPropsWithRef<"button">, "children">) {
  return (
    <button type={type} className={classes(variant, className)} {...rest}>
      {icon}
      <span>{children}</span>
      {trailingIcon}
    </button>
  );
}

export function ButtonLink({ variant = "secondary", icon, trailingIcon, children, className, href, ...rest }: CommonProps & { href: string; "data-testid"?: string }) {
  return (
    <Link href={href} className={classes(variant, className)} {...rest}>
      {icon}
      <span>{children}</span>
      {trailingIcon}
    </Link>
  );
}
