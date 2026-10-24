import React, { useState } from "react";

import { Avatar, Button, Checkbox, Kbd, Tooltip } from "@/shared/ui";

// Not an image, and not a request: the fallback shows without a 404 in the console.
const UNDECODABLE_IMAGE = "data:image/png;base64,AAAA";

const ignoreChange = () => undefined;

export const AvatarSamples: React.FC = () => (
  <div className="flex flex-wrap items-center gap-2">
    <Avatar name="Ada Lovelace" size="xs" />
    <Avatar name="Grace Hopper" size="sm" />
    <Avatar name="Émile Zola" />
    <Avatar name="john.doe@example.com" size="lg" />
    <Avatar name="Margaret Hamilton" src="/favicon.svg" />
    <Avatar name="Linus Torvalds" src={UNDECODABLE_IMAGE} />
  </div>
);

export const KeySamples: React.FC = () => (
  <div className="flex flex-wrap items-center gap-1">
    <Kbd>Ctrl</Kbd>
    <Kbd>K</Kbd>
  </div>
);

export const CheckboxSamples: React.FC = () => {
  const [subscribed, setSubscribed] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Checkbox checked={subscribed} onChange={setSubscribed} label="Subscribe" />
      <Checkbox checked={false} indeterminate onChange={ignoreChange} label="Some selected" />
      <Checkbox checked disabled onChange={ignoreChange} label="Locked" />
    </div>
  );
};

export const TooltipSample: React.FC = () => (
  <Tooltip label="Saves the page">
    <Button>Save</Button>
  </Tooltip>
);
