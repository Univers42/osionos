import type { usePageActions } from '@/entities/page/model/usePageActions';

/** The page-menu action surface; keeps page-menu files unaware of the hook body. */
export type ReturnTypeOfUsePageActions = ReturnType<typeof usePageActions>;
