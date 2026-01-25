import * as React from "react";

import { cn } from "@/lib/utils";
import { Eye, EyeOff } from "lucide-react";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    const [show, setShow] = React.useState(false);

    const isPassword = type === "password";
    const inputType = isPassword ? (show ? "text" : "password") : (type as any);

    return (
      <div className="relative w-full">
        <input
          type={inputType}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            // reserve space for the eye icon when this is a password field
            isPassword && "pr-10",
            className,
          )}
          ref={ref}
          {...props}
        />

        {isPassword && (
          <button
            type="button"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((s) => !s)}
            onMouseDown={(e) => e.preventDefault()} // prevent losing focus from the input
            className="absolute inset-y-0 right-2 flex items-center text-muted-foreground"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
