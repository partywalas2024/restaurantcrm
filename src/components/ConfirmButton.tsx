"use client";

import type { ButtonHTMLAttributes } from "react";

/** A submit button that asks "are you sure?" first — for owner-only deletes. */
export function ConfirmButton({
  message,
  onClick,
  ...props
}: { message: string } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="submit"
      onClick={(e) => {
        if (!window.confirm(message)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
    />
  );
}
