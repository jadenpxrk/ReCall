import { Handle, Position } from "@xyflow/react";

import React from "react";

export default function WebsiteNode({ data }: { data: any }) {
  // format visit count
  const formatVisitCount = (count: number) => {
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}k`;
    }
    return count;
  };

  // formatting
  const formatLastVisit = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;

    // convert to days
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return "Today";
    } else if (days === 1) {
      return "Yesterday";
    } else if (days < 7) {
      return `${days} days ago`;
    } else if (days < 30) {
      const weeks = Math.floor(days / 7);
      return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
    } else {
      const months = Math.floor(days / 30);
      return `${months} ${months === 1 ? "month" : "months"} ago`;
    }
  };

  return (
    <div className="group">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 bg-gray-400"
      />
      <div className="flex flex-col p-2 rounded-md transition-all duration-200 group-hover:scale-105">
        <div className="font-medium">{data.label}</div>
        {data.visitCount && (
          <div className="text-xs mt-1 opacity-70">
            {formatVisitCount(data.visitCount)} visits
          </div>
        )}
        {data.lastVisitTime && (
          <div className="text-xs opacity-70">
            {formatLastVisit(data.lastVisitTime)}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 bg-gray-400"
      />
    </div>
  );
}
