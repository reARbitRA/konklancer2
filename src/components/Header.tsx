/**
 * Route/tab identifiers shared by StatusBar, MobileNav and App.
 *
 * The previous legacy `Header` component that lived in this file was removed:
 * the app shell is now `components/layout/BrutalHeader.tsx` (neo-brutalist),
 * and keeping a second, unstyled header around only invited accidental
 * regressions. This module intentionally exports types only.
 */
export type AppTab = 'hunter' | 'coder' | 'pipeline' | 'autopilot';
