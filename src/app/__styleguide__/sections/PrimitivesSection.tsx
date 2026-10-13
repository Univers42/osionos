import React from "react";

import { Badge, Button, Card, Input } from "@/shared/ui";
import { AvatarSamples, CheckboxSamples, KeySamples, TooltipSample } from "./ControlSamples";
import { StyleGuideSection } from "./StyleGuideSection";

export const PrimitivesSection: React.FC = () => (
  <StyleGuideSection title="Primitives">
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button tone="primary">Primary</Button>
        <Button tone="default">Default</Button>
        <Button tone="danger">Danger</Button>
        <Button tone="ghost">Ghost</Button>
        <Button tone="default" disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>default</Badge>
        <Badge tone="accent">accent</Badge>
        <Badge tone="success">success</Badge>
        <Badge tone="danger">danger</Badge>
        <Badge tone="warning">warning</Badge>
      </div>
      <Input placeholder="Type something…" defaultValue="" />
      <Card
        title="Card title"
        description="A docs-style nav card with hover affordance."
        onClick={() => undefined}
      />
      <AvatarSamples />
      <KeySamples />
      <CheckboxSamples />
      <TooltipSample />
    </div>
  </StyleGuideSection>
);
