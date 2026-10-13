/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   StyleGuideRoute.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

import { BlockSections } from "./sections/BlockSections";
import { ColorSections } from "./sections/ColorSections";
import { DensitySection } from "./sections/DensitySection";
import { MotionSection } from "./sections/MotionSection";
import { OverlaySection } from "./sections/OverlaySection";
import { PrimitivesSection } from "./sections/PrimitivesSection";
import { ElevationSection, RadiusSection } from "./sections/ShapeSections";
import { TypeSection } from "./sections/TypeSection";
import { StyleGuideToolbar } from "./StyleGuideToolbar";

/**
 * DEV-only design-system reference. It renders once against the document's own
 * theme and palette — no nested theme columns — so a palette or token change is
 * reviewed against what the app actually boots with. Code-split out of prod.
 */
export const StyleGuideRoute: React.FC = () => (
  <main
    data-testid="styleguide"
    className="h-screen w-screen overflow-auto bg-[var(--osio-bg-page)] text-[var(--osio-fg-default)]"
  >
    <div className="mx-auto flex max-w-[1200px] flex-col gap-10 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1
          className="text-2xl font-bold text-[var(--osio-fg-strong)]"
          style={{ fontFamily: "var(--osio-font-family-serif)" }}
        >
          osionos design system
        </h1>
        <StyleGuideToolbar />
      </div>
      <ColorSections />
      <TypeSection />
      <RadiusSection />
      <ElevationSection />
      <MotionSection />
      <DensitySection />
      <OverlaySection />
      <PrimitivesSection />
      <BlockSections />
    </div>
  </main>
);

export default StyleGuideRoute;
