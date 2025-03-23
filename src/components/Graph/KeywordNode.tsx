import { Handle, Position } from "@xyflow/react";

import React from "react";

export default function KeywordNode({ data }: { data: any }) {
  return (
    <div className="group">
      <Handle
        type="target"
        position={Position.Left}
        className="w-2 h-2 bg-gray-400"
      />
      <div className="flex flex-col p-2 rounded-md transition-all duration-200 group-hover:scale-105">
        <div className="font-medium">{data.label}</div>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="w-2 h-2 bg-gray-400"
      />
    </div>
  );
}
