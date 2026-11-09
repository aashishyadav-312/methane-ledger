# Approved design mockups (8 Nov 2026)

These files are artboards from the design canvas, written in its own format (`<x-dc>`, `{{holes}}`, `<sc-for>`,
`class Component extends DCLogic`). They are not runnable app code.

- `Main.dc.html`: desktop landing page with the map. The map SVG was generated with placeholder bands.
- `Landing-Mobile.dc.html`: the landing page at 390px.
- `Moonidih.dc.html`: the mine page. Its script block has a working JS prototype of the controls and the model.
- `Style.dc.html`: palette, type and components.

Port the structure, spacing and styles, using tokens from `docs/DESIGN.md`. One known change since approval: the
Moonidih pin takes the colour of its real band (2032 to 2036, orange), because the closure workbook puts its run-out
in 2034.
