/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   homeGraphParts.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/07 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/07 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import type { HomeGraphProperty } from "../model/homeKnowledgeGraphData";
import { type SimLink, type SimNode, NODE_COLORS, VIEWBOX_HEIGHT, VIEWBOX_WIDTH } from "./homeGraphModel";
import { resolveLinkNode } from "./homeGraphSelection";
import { inputValue, propertyInputType, stringValue } from "./homeGraphValue";

export const GraphLinks: React.FC<{ links: SimLink[]; selectedLinkIds: Set<string> }> = ({ links, selectedLinkIds }) => (
  <g className="osionos-home-graph-links">
    {links.map((link) => {
      const source = resolveLinkNode(link.source);
      const target = resolveLinkNode(link.target);
      if (!source || !target) return null;
      return (
        <line
          key={link.id}
          x1={source.x ?? VIEWBOX_WIDTH / 2}
          y1={source.y ?? VIEWBOX_HEIGHT / 2}
          x2={target.x ?? VIEWBOX_WIDTH / 2}
          y2={target.y ?? VIEWBOX_HEIGHT / 2}
          data-relation={link.relation}
          data-related={selectedLinkIds.has(link.id) ? "true" : undefined}
        />
      );
    })}
  </g>
);

export const GraphNodes: React.FC<{
  nodes: SimNode[];
  relatedNodeIds: Set<string>;
  selectedNodeId?: string;
  onNodePointerDown: (event: React.PointerEvent<SVGGElement>, node: SimNode) => void;
  isNodePointerMoving: () => boolean;
  onNodeClick: (node: SimNode) => void;
}> = ({ nodes, relatedNodeIds, selectedNodeId, onNodePointerDown, isNodePointerMoving, onNodeClick }) => (
  <g className="osionos-home-graph-nodes">
    {nodes.map((node) => {
      const isSelected = selectedNodeId === node.id;
      const isRelated = isSelected || relatedNodeIds.has(node.id);
      const shouldLabel = isSelected || (isRelated && node.kind !== "product") || node.size > 17;
      return (
        <g
          key={node.id}
          transform={`translate(${node.x ?? VIEWBOX_WIDTH / 2} ${node.y ?? VIEWBOX_HEIGHT / 2})`}
          data-kind={node.kind}
          data-related={isRelated ? "true" : undefined}
          data-selected={isSelected ? "true" : undefined}
          onPointerDown={(event) => onNodePointerDown(event, node)}
          onPointerUp={() => {
            if (!isNodePointerMoving()) onNodeClick(node);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onNodeClick(node);
          }}
        >
          <circle className="osionos-home-graph-hit-target" r={Math.max(18, node.size + 10)} />
          <circle r={Math.max(7, node.size)} fill={NODE_COLORS[node.kind]} />
          {shouldLabel ? <text x={node.size + 8} y="4">{node.title}</text> : null}
        </g>
      );
    })}
  </g>
);

export const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <span>{label}</span>
    <strong>{value}</strong>
  </div>
);

export const GraphPropertyEditor: React.FC<{
  property: HomeGraphProperty;
  onChange: (value: HomeGraphProperty["value"]) => void;
  onOpenRelation: (relationId: string) => void;
  relationTitle: (relationId: string) => string;
}> = ({ property, onChange, onOpenRelation, relationTitle }) => {
  const value = property.value;

  if (property.type === "checkbox") {
    return (
      <label className="osionos-home-graph-property">
        <span>{property.label}</span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
      </label>
    );
  }

  if ((property.type === "select" || property.type === "status") && property.options?.length) {
    return (
      <label className="osionos-home-graph-property">
        <span>{property.label}</span>
        <select value={stringValue(value)} onChange={(event) => onChange(event.target.value)}>
          {property.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
    );
  }

  if (property.type === "relation") {
    const relations = Array.isArray(value) ? value : [];
    return (
      <div className="osionos-home-graph-property osionos-home-graph-property--relation">
        <span>{property.label}</span>
        <div>
          {relations.length ? relations.map((relation) => <button key={relation} type="button" onClick={() => onOpenRelation(relation)}>{relationTitle(relation)}</button>) : <em>No relations</em>}
        </div>
      </div>
    );
  }

  return (
    <label className="osionos-home-graph-property">
      <span>{property.label}</span>
      <input
        type={propertyInputType(property.type)}
        value={inputValue(value, property.type)}
        onChange={(event) => onChange(property.type === "number" ? Number(event.target.value) : event.target.value)}
      />
    </label>
  );
};
