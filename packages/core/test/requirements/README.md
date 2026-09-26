Requirement tests for the layout, docking and navigation model. Each test name carries a
requirement ID (LAYOUT-, DOCK-, NAV-). The tests describe behaviour through a small adapter:
`trellis-adapter.ts` builds fixtures and calls the production model, so the expectations in the
`*.test.ts` files stay independent of Trellis's internal APIs. Where a test deliberately differs
from the plain requirement, the adapter says why inline.
