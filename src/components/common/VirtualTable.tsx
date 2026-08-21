import React, { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

interface VirtualTableProps<T> {
  data: T[];
  height?: number;
  estimateSize?: number;
  renderRow: (item: T, index: number) => React.ReactNode;
  header: React.ReactNode;
}

export function VirtualTable<T>({
  data,
  height = 600,
  estimateSize = 56,
  renderRow,
  header,
}: VirtualTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: data.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 5,
  });

  return (
    <div className="w-full flex flex-col overflow-hidden rounded-xl border border-slate-800 bg-[#0F131D]">
      {/* Fixed Table Header */}
      <div className="shrink-0 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
        {header}
      </div>

      {/* Scrollable Virtual Body */}
      <div
        ref={parentRef}
        style={{ height: `${height}px`, overflow: 'auto' }}
        className="custom-scrollbar w-full relative"
      >
        <div
          style={{
            height: `${rowVirtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={virtualRow.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {renderRow(data[virtualRow.index], virtualRow.index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
