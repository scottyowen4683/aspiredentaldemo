import * as React from "react";
import { Button } from "./button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => Promise<void> | void;
};

export function ConfirmDialog({ open, onOpenChange, title = "Confirm", description, confirmLabel = "Confirm", cancelLabel = "Cancel", onConfirm }: ConfirmDialogProps) {
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>{cancelLabel}</Button>
          <Button onClick={async () => {
            try {
              setIsSubmitting(true);
              await onConfirm();
            } finally {
              setIsSubmitting(false);
              onOpenChange(false);
            }
          }} disabled={isSubmitting}>{isSubmitting ? "Working..." : confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmDialog;
