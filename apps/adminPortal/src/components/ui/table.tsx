import * as React from 'react';
import { className } from '@/lib/className';

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <div className="w-full overflow-auto">
      <table className={className('w-full caption-bottom text-sm', customClassName)} ref={ref} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <thead className={className('[&_tr]:border-b', customClassName)} ref={ref} {...props} />
  ),
);
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <tbody className={className('[&_tr:last-child]:border-0', customClassName)} ref={ref} {...props} />
  ),
);
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <tr className={className('border-b transition-colors hover:bg-muted/50', customClassName)} ref={ref} {...props} />
  ),
);
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <th
      className={className('h-10 px-2 text-left align-middle font-medium text-muted-foreground', customClassName)}
      ref={ref}
      {...props}
    />
  ),
);
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className: customClassName, ...props }, ref) => (
    <td className={className('p-2 align-middle', customClassName)} ref={ref} {...props} />
  ),
);
TableCell.displayName = 'TableCell';
