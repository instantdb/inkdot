# Template Fixes - Remove Memes & Improve Quality

## What
Removed 3 meme templates, fully rewrote 6 bad templates, and touched up 6 decent templates.

## Changes

### Removed (3 templates)
- `pepe.svg`, `wojak.svg`, `trollface.svg` - Removed from TEMPLATES array in components.tsx and deleted SVG files

### Full Rewrites (6 templates)
- **guitar.svg** - Was two overlapping circles + disconnected neck. Now has proper figure-8 body, connected neck with frets, headstock with tuning pegs, sound hole with rosette, bridge with pins, 6 strings
- **elephant.svg** - Was giant circle head on circle body. Now side-view with big floppy ears, long curling trunk, tusks, 4 thick legs with toenails, tail with tuft, wrinkle details
- **the-scream.svg** - Was stick figure with no hands on cheeks. Now has elongated anguished face, hands pressed on cheeks with finger detail, bridge with railing in perspective, two background figures, dramatic wavy sky/landscape
- **persistence-of-memory.svg** - Was random ovals on rectangles. Now has 4 distinct melting clocks (on tree branch, on ledge edge, on creature, pocket watch with ants), dead tree, distant cliffs, barren landscape, strange melting creature
- **whale.svg** - Was blob oval with tiny eye. Now proper whale shape with arched back, tail flukes with notch, pectoral flipper, blowhole with water spout, belly ventral grooves, mouth line
- **dinosaur.svg** - Was oval body with 2 legs. Now T-Rex with big head, open jaw with teeth (upper and lower), fierce eye with brow ridge, tiny arms with claws, muscular hind legs with toes, long tapering tail, spine bumps

### Touch-ups (6 templates)
- **starry-night.svg** - Cypress tree much wider/taller with flame shape and inner texture, village buildings much larger with windows, more dramatic triple-layer swirls, additional stars
- **owl.svg** - Added more wing feather lines (7 per wing), scalloped outer wing edge feathers
- **penguin.svg** - Stronger tuxedo contrast with belly edge lines and darker fill-opacity, ice/snow ground hints
- **fortune-cookie.svg** - Added squiggly text lines on the fortune paper strip
- **sloth.svg** - Stronger/thicker claws on all 4 limbs, more fur texture hints across body (12 total)
- **koala.svg** - Bigger fluffy ears (r=52 vs r=45) with fluffy edge detail, clearer arm grip with paw wrapping and visible claws

## Style Guidelines Followed
All templates: 800x600 viewBox, stroke="#888", stroke-width="2.5", stroke-linecap/linejoin="round", light fills with fill-opacity 0.03-0.07
