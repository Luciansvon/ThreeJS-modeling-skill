# 3D Art Style Catalog

Lightweight on-demand lookup for procedural Three.js modeling, materials, and rendering. **Do not load or dump this entire catalog automatically.** Pick **1 primary style + at most 2 modifiers** from the user brief or reference image, jump straight to those headings, and never let generic style recipes override the user's actual reference proportions or colors. If a reference is missing or unclear, ask the user to re-upload instead of inventing details.

Contents: Selection & combination workflow · GLB vs preview matrix · Geometry styles (7) · Material styles (7) · Rendering styles (7) · Art direction (6)

---

## Selection & combination workflow

1. **Analyze input:** Inspect the user's reference image or text description first; lock silhouette proportions, part colors, and target deployment budget.
2. **Choose `1 primary + <= 2 modifiers`:** Usually `1` geometry or material pillar (e.g., `Chibi` or `Voxel`) + up to `2` compatible modifiers (e.g., `Hand-Painted` + `Toon Shading`, or `Low Poly` + `Cozy Pastel`). Avoid stacking clashing silhouettes (for instance `Voxel` + `Smooth Stylized`).
3. **Read only matching headings:** Consult the 1–3 chosen subsections below and translate them into native Three.js constructor options, geometry builders, procedural textures, and lighting/outline choices.
4. **Run the existing pipeline & QA:** Build via the single pure seeded `buildAsset(params, THREE)` function, pass `Q1–Q10`, budget, and color gates (`G3` / `G4`), then verify in preview and `.glb` round-trip.

## GLB vs preview matrix

| Technique in Three.js | Preserved cleanly in `.glb`? | Notes for export & preview |
|---|---|---|
| `MeshStandardMaterial` + roughness/metalness + vertex colors | **Yes** | Primary PBR carrier across glTF viewers and engines. Always pass colors through `new THREE.Color(hex)`. |
| Procedural `DataTexture` / `CanvasTexture` (`baseColor`, `roughnessMap`) | **Yes** (with UV + `SRGBColorSpace` on color maps) | Keep the exact fixed texture input for both preview and export. |
| `MeshToonMaterial` + `gradientMap` | **Partial (Preview-only ramp)** | `GLTFExporter` serializes `MeshToonMaterial` as standard glTF `pbrMetallicRoughness` (base color & map survive, multi-step toon ramp light snapping does **not** export natively). |
| Inverted-hull (`BackSide`) meshes or `EdgesGeometry` line overlays | **Mixed** | Inverted-hull geometry exports as real double meshes (increases tri count, looks odd if an engine expects front-face shading only); `LineSegments` ink lines vary by viewer. Document clearly or gate behind preview VFX when targeting clean `.glb`. |
| Custom `ShaderMaterial` / studio lights / `_studio_vfx` | **Preview-only** | Custom GLSL shaders do not convert to glTF PBR materials, and `_studio_vfx` stays outside the exported root. |

---

## Geometry styles

### Low Poly
- **Visual traits:** Crisp faceted triangles, bold silhouette planes, minimal clutter, readable shadow breaks across flat faces.
- **Geometry rules:** Use angular extrusions, low segment counts (5–8 radial sides), chamfered bends (`>= 3` rings only where skinned joints flex), and intentional non-smoothed facets.
- **Materials & palette:** High roughness (`0.78–0.92`), low metalness (`0–0.1`), clean color blocks or per-triangle centroid/normal tinting; keep contrast sharp between lit planes and ambient shadow sides.
- **Three.js implementation:** Use `PartBuilder` with `bakeFlat` + `lowPolyMaterial({ flatShading: true })` (built-in `MeshStandardMaterial`), convert sRGB hexes with `new THREE.Color(hex)`.
- **Visual inspiration:** [Monument Valley aesthetic](https://en.wikipedia.org/wiki/Monument_Valley_(video_game)) · [Firewatch stylized terrain](https://en.wikipedia.org/wiki/Firewatch) · [Three.js MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- **Technical limits:** Flat shading duplicates normals per triangle (~3x vertices vs indexed smooth meshes); stay disciplined on face counts for mobile targets.

### Voxel
- **Visual traits:** Stepped 3D cubic lattice (`1:1:1` unit blocks), sharp `90°` corners, pixel-crisp surface mosaic, tactile miniature scale.
- **Geometry rules:** Build on one integer grid with shared `voxelSize`; mirror symmetrically (`even` or `odd` axis), resolve 2×2 diagonal pinches, and sculpt curved horns/tails/snouts smoothly (`fillTube`, `fillCubicBezier`, `fillSuperEllipsoid`) instead of 40+ loose rigid boxes. Separate animated rigid limbs with `>= 2`-voxel joint overlaps or bind flexible parts cleanly in a single mesh per material via world-corner weights.
- **Materials & palette:** Matte body (`roughness ~0.84`, `metalness ~0.04`) with automatic Corner Voxel AO (`ao: true` default) paired with unlit/HDR emissive eyes/flames (`createVoxelMaterials` / `createHdrGlowMaterial` + `glowBoost` for optional Studio Bloom) capped at minimal draw calls. Shift dark tones safely with `shadeHexSRGB` (never linear `offsetHSL`).
- **Three.js implementation:** Use `VoxelGrid` + `createVoxelMaterials` with default Corner AO and watertight culling for strict closed-edge QA, or opt-in `{ greedy: true }` on static blocks to cut planar triangles by ~40–60%.
- **Visual inspiration:** [Minecraft voxel craft](https://www.minecraft.net/) · [Crossy Road isometric voxels](https://en.wikipedia.org/wiki/Crossy_Road) · [3D Dot Game Heroes](https://en.wikipedia.org/wiki/3D_Dot_Game_Heroes)
- **Technical limits:** High voxel resolution scales triangle count quadratically (`O(n^2)` exposed faces); `greedy` merging can introduce T-junctions rejected by strict weld edge checks, so keep `greedy: false` when strict manifold edge QA runs.

### Blocky
- **Visual traits:** Chunky architectural or articulated box primitives, distinct chamfered seams, asymmetrical interlocking slabs without tiny staircase voxel noise.
- **Geometry rules:** Construct parts from scaled, beveled boxes, tapered trapezoidal prisms, and clean overlaps at shoulders/hips (`5–10%` overlap). Keep face proportions graphic and sturdy.
- **Materials & palette:** Matte plastic or painted wood roughness (`0.55–0.8`), bold segmented color zoning per part, optional recessed seams via vertex color darkening.
- **Three.js implementation:** Combine `BoxGeometry`, `taperedBoxTris`, and `boxTris` inside `PartBuilder` or `RigBuilder`; keep box-projected UVs only when decals/grain are needed.
- **Visual inspiration:** [Lego Builder's Journey](https://en.wikipedia.org/wiki/Lego_Builder%27s_Journey) · [Roblox classic R15 silhouette](https://en.wikipedia.org/wiki/Roblox) · [Mine-imator chunky rigs](https://en.wikipedia.org/wiki/Minecraft)
- **Technical limits:** Bare sharp 90° edges catch less specular highlight unless given tiny bevels or normal breaks; watch Z-fighting on coplanar overlap faces.

### Smooth Stylized
- **Visual traits:** Clean sweeping curves, tapered limbs, broad muscular/organic planes with subtle crisp creasing at armor/cloth folds (Blizzard / Pixar-lite clarity).
- **Geometry rules:** Use spline lofts and multi-ring `tubeTris` (`10–16` sides), `LatheGeometry` profiles, and shared smooth normals across curved surfaces while preserving explicit crease splits at hard borders.
- **Materials & palette:** Balanced dielectric roughness (`0.45–0.75`), warm-cool gradient tinting across limbs/extremities, subtle ambient occlusion in joints (`aoShade`).
- **Three.js implementation:** Author smooth indexed `BufferGeometry` (`SkinnedMesh` for flexible bodies/tails), call `computeVertexNormals()` only on intended smooth groups; pair with `MeshStandardMaterial({ flatShading: false })`.
- **Visual inspiration:** [Overwatch / Blizzard stylization](https://en.wikipedia.org/wiki/Overwatch_(video_game)) · [Arcane (Fortiche sculpted planes)](https://en.wikipedia.org/wiki/Arcane_(TV_series)) · [Kena: Bridge of Spirits](https://en.wikipedia.org/wiki/Kena:_Bridge_of_Spirits)
- **Technical limits:** Over-smoothing small mechanical edges creates pillowy shading artifacts; separate vertices cleanly where crease angles exceed `~45°`.

### Chibi
- **Visual traits:** Expressive super-deformed proportions (`1:1` to `1:1.5` head-to-body ratio), large readable eyes (~20–30% face height), stubby limbs, oversized paws/feet, immediate silhouette charm.
- **Geometry rules:** Emphasize crown/cheek volume and simplify torso/finger details so limbs stay chunky and readable from isometric or 3/4 distance. Isolate eyes, eyelids, brows, and jaw in closed sockets for clear blinking and combat expressions.
- **Materials & palette:** High-clarity playful colors, bright cornea/iris contrast (`emissive` or specular glint), clean material separation so face markings never mush into skin tones.
- **Three.js implementation:** Oversize `head` bone proportions in `RigBuilder` or `VoxelGrid`, separate `eyeL/R`, `eyelidL/R`, `browL/R`, `lowerJawPivot` pivots, and tune `Idle` squash/stretch + blinks cleanly.
- **Visual inspiration:** [The Legend of Zelda: Link's Awakening remake](https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_Link%27s_Awakening_(2019_video_game)) · [Animal Crossing: New Horizons](https://en.wikipedia.org/wiki/Animal_Crossing:_New_Horizons) · [Nendoroid proportions](https://en.wikipedia.org/wiki/Nendoroid)
- **Technical limits:** Tiny torso/arm clearance causes clipping during arm swings or flight unless shoulders flare slightly outward (`±X`) in rest pose.

### Hard Surface
- **Visual traits:** Precision mechanical panels, bevels, chamfers, vents, pistons, bolts, and functional clearances across robots, vehicles, armor, and props.
- **Geometry rules:** Prioritize multi-piece modular silhouettes with panel offsets, cylindrical hinges on dedicated spin/steer pivots, and extruded brackets (`extrudeTris` with bevels). Avoid paper-thin single quads unless flagged `--open`.
- **Materials & palette:** Mixed brushed metal (`metalness 0.75–0.92`, `roughness 0.25–0.45`), satin polymer armor (`roughness 0.4–0.55`), rubber matte accents (`0.85`), and sharp emissive status strips.
- **Three.js implementation:** Split metal vs dielectric meshes into distinct `MeshStandardMaterial` instances; ensure `RoomEnvironment` PMREM lighting is active in preview so metals reflect cleanly instead of turning black.
- **Visual inspiration:** [Armored Core VI mechanical craft](https://en.wikipedia.org/wiki/Armored_Core_VI:_Fires_of_Rubicon) · [Titanfall industrial design](https://en.wikipedia.org/wiki/Titanfall_2) · [Three.js metallic materials](https://threejs.org/docs/pages/MeshStandardMaterial.html)
- **Technical limits:** Metallic materials look flat black in headless/no-env scenes without `scene.environment` (`RoomEnvironment`); glTF exports preserve `metalnessFactor`, relying on viewer IBL.

### Primitive-Based
- **Visual traits:** Iconic, ultra-clean assemblage built visibly from geometric solids (spheres, capsules, cylinders, toruses, rounded cones) reminiscent of toy blocks or abstract sculptures.
- **Geometry rules:** Keep seams proud and legible with deliberate proportions and silhouette rhythm rather than boolean-merging into mush. Ensure closed primitive caps stay manifold and grounded at `Y = 0`.
- **Materials & palette:** Uniform matte/satin finish per primitive (`roughness 0.45–0.75`), bold modernist or primary color blocking, optional studio rim highlight.
- **Three.js implementation:** Compose `CapsuleGeometry`, `CylinderGeometry`, `SphereGeometry`, and `TorusGeometry` with deterministic scales and clean hierarchy transforms via `PartBuilder` or named `Group` pivots.
- **Visual inspiration:** [Katamari Damacy](https://en.wikipedia.org/wiki/Katamari_Damacy) · [Fall Guys rounded silhouettes](https://en.wikipedia.org/wiki/Fall_Guys) · [Three.js CapsuleGeometry](https://threejs.org/docs/pages/CapsuleGeometry.html)
- **Technical limits:** Excessive primitive segment defaults (`32×16`) waste budget silently—explicitly pass conservative radial/height segment parameters (`8–16`).

---

## Material styles

### Claymation
- **Visual traits:** Hand-sculpted tactile warmth, softened corners, thumbprint/tool imperfections, matte polymer clay absorption, zero plastic mirror shine.
- **Geometry rules:** Favor rounded volumes (`CapsuleGeometry`, smoothed lofts), slight organic wobble (`applyVertexJitter` around `2–4%` of limb radius on non-joint caps), and gentle rolled collar seams at joins.
- **Materials & palette:** Matte finish (`roughness 0.85–0.96`, `metalness 0.0`), subtle low-frequency seeded grain map or micro-bump map, earthy + saturated stop-motion palette.
- **Three.js implementation:** Build smoothed `BufferGeometry` + subtle `DataTexture` roughness/normal micro-grain (kept `NoColorSpace`), plus optional stepped/held keyframes (`24 fps` held every 2–3 frames) for stop-motion motion feel.
- **Visual inspiration:** [Aardman / Wallace & Gromit stop-motion](https://www.aardman.com/) · [The Neverhood / Armikrog](https://en.wikipedia.org/wiki/The_Neverhood) · [The Midnight Walk craft](https://en.wikipedia.org/wiki/Stop_motion)
- **Technical limits:** True subsurface scattering (`MeshPhysicalMaterial` thickness) does not survive standard glTF PBR reliably and increases shader cost—fake warmth with soft albedo fill + roughness.

### Hand-Painted
- **Visual traits:** Artistic brushstroke variation, baked directional value gradients (lighter top planes, deeper crevices), warm-to-cool hue shifts, zero noisy photo grain.
- **Geometry rules:** Silhouette should stay slightly thicker and chunkier so painterly silhouettes remain clear; preserve continuous clean UVs (`uv: 'box'` or semantic atlas strips) without stretching across seams.
- **Materials & palette:** Diffuse-driven look (`roughness 0.72–0.88`, `metalness 0–0.08`); paint light-dark tonal gradients and rim accents directly into albedo `DataTexture`/`CanvasTexture` or vertex colors.
- **Three.js implementation:** Generate a seeded procedural brush `DataTexture` (`SRGBColorSpace`, mipmaps enabled) alongside directional vertex gradient shading; works cleanly on `MeshStandardMaterial` or `MeshToonMaterial`.
- **Visual inspiration:** [Arcane painted textures](https://en.wikipedia.org/wiki/Arcane_(TV_series)) · [World of Warcraft stylized art](https://en.wikipedia.org/wiki/World_of_Warcraft) · [Hades character value hierarchy](https://en.wikipedia.org/wiki/Hades_(video_game))
- **Technical limits:** Strong baked highlights baked into `baseColor` can conflict with moving dynamic studio lights unless balanced with gentle roughness (`>= 0.75`).

### Papercraft
- **Visual traits:** Crisp flat origami/cardstock facets, folded tabs, layered shadow-box diorama thickness, subtle uncoated paper fiber tooth.
- **Geometry rules:** Build shapes from folded triangular planes, thin rigid slabs (`extrudeTris` thickness `>= 0.015 m` for solid glTF faces, or mark true single-sheet folds `--open`), and visible fold creases (`bakeFlat`).
- **Materials & palette:** Ultra-matte uncoated paper (`roughness 0.90–0.98`, `metalness 0`), warm off-whites (`#f2ede4`), vivid craft cardstock inks, micro-fiber procedural albedo noise (`variation 0.06`).
- **Three.js implementation:** Use flat-shaded `MeshStandardMaterial` + optional crisp fold-crease `EdgesGeometry` accents in preview; keep shadows enabled (`castShadow = true`) so layered paper cutouts cast tactile drop shadows onto lower tiers.
- **Visual inspiration:** [Tearaway folded world](https://en.wikipedia.org/wiki/Tearaway_(video_game)) · [Paper Mario: The Origami King](https://en.wikipedia.org/wiki/Paper_Mario:_The_Origami_King) · [Kamiwaza / Papercraft fold design](https://en.wikipedia.org/wiki/Origami)
- **Technical limits:** Zero-thickness sheets fail watertight `Q4` checks unless thinned into solid cardstock plates (`> 0` volume) or explicitly excluded via `--open`.

### Wool
- **Visual traits:** Cozy knitted yarn or needle-felted fuzz, soft silhouette glow, stitched seams, tactile yarn-twist striping on rounded forms.
- **Geometry rules:** Keep silhouettes plush and pill-shaped (`CapsuleGeometry`, bulbous limbs), add braided/ribbed `TorusGeometry` collars or stitch bands, and avoid razor-sharp points.
- **Materials & palette:** Ultra-matte wool (`roughness 0.94–1.0`, `metalness 0`), procedural directional knit herringbone/weave `DataTexture` (`baseColor` + subtle `bumpMap`/`roughnessMap`), warm dyed yarn colors.
- **Three.js implementation:** Use `MeshStandardMaterial({ roughness: 0.95 })` with a seamless procedural woven `DataTexture` (`RepeatWrapping`); in preview only, optional `MeshPhysicalMaterial({ sheen: 0.85, sheenRoughness: 0.75 })` adds soft grazing rim fuzz without changing base `.glb` geometry.
- **Visual inspiration:** [Yoshi's Crafted World / Woolly World](https://en.wikipedia.org/wiki/Yoshi%27s_Woolly_World) · [Unravel yarn character craft](https://en.wikipedia.org/wiki/Unravel_(video_game)) · [Three.js MeshPhysicalMaterial sheen](https://threejs.org/docs/pages/MeshPhysicalMaterial.html)
- **Technical limits:** Real fiber strands/hair cards explode triangle budgets quickly; represent yarn texture optically via procedural weave/bump maps instead of thousands of strand meshes.

### Wooden Toy
- **Visual traits:** Lathe-turned or band-sawn timber blocks, visible directional wood grain and end-grain rings, softly chamfered safety edges, satin beeswax sheen.
- **Geometry rules:** Combine `LatheGeometry` pegs/heads, extruded flat slabs (`extrudeTris` with slight end chamfer), and crisp dowel joints.
- **Materials & palette:** Satin wax or clear coat (`roughness 0.42–0.65`, `metalness 0`), light birch/oak/walnut grain aligned per part (`boxProjectUV`), plus opaque semi-matte toy paint color blocks exposing natural grain accents.
- **Three.js implementation:** Generate deterministic wood-ring `DataTexture` (stretched along grain axis per UVs) paired with `MeshStandardMaterial` and `lowPolyMaterial`; vary hue slightly per wooden peg.
- **Visual inspiration:** [Wooden peg & block toy craft](https://en.wikipedia.org/wiki/Wooden_toy) · [Toca Blocks / Brio aesthetic](https://en.wikipedia.org/wiki/Brio_(company)) · [Three.js LatheGeometry](https://threejs.org/docs/pages/LatheGeometry.html)
- **Technical limits:** Applying one un-rotated triplanar UV onto angled planks misaligns wood grain—orient UVs along each board's long axis.

### Vinyl Toy
- **Visual traits:** Designer blind-box vinyl collectible feel (Kidrobot / Funko-adjacent clean mold lines), buttery smooth rounded mass, clean matte-plus-gloss contrast between shell and eyes/visage.
- **Geometry rules:** Rounded sweeping silhouettes (`>= 12–16` segments on key curves), clear molded parting lines/collars where head meets body, clean closed-bottom feet (`ground()`).
- **Materials & palette:** Signature satin vinyl (`roughness 0.28–0.42`, `metalness 0.02`) contrasted against ultra-glossy painted eyes/visor (`roughness 0.08–0.15`) or flocked matte accents (`0.9`).
- **Three.js implementation:** Smooth vertex normals on `MeshStandardMaterial` with carefully calibrated specular roughness (`~0.32`), plus high-contrast decal markings or clean color-blocked separate shells.
- **Visual inspiration:** [Designer Art Toys (Dunny / Bearbrick)](https://en.wikipedia.org/wiki/Art_toy) · [Astrobots / Astro Bot satin vinyl hero sheen](https://en.wikipedia.org/wiki/Astro_Bot) · [Three.js RoomEnvironment lighting](https://threejs.org/docs/pages/RoomEnvironment.html)
- **Technical limits:** Too much uniform gloss (`roughness < 0.2`) without balanced studio light positioning creates blown-out hotspots; pair specular parts with rougher cloth/prop contrast.

### Pixelated
- **Visual traits:** Nearest-neighbor crisp texels, low-res pixel-art surface painted onto cleanly UV-mapped low-poly or PS1-like geometry (no blurry bilinear smear).
- **Geometry rules:** Keep mesh planes orthogonal or cleanly UV-unwrapped to integer pixel grids (`16×16` or `32×32` texels per meter) so pixels map squarely without diagonal warping.
- **Materials & palette:** Limited deliberate indexed palette (`12–32` hues), `roughness 0.78–0.92`, `magFilter = THREE.NearestFilter`, `minFilter = THREE.NearestFilter` (or mipmap-free `NearestFilter`) + `generateMipmaps = false` for razor-sharp texels.
- **Three.js implementation:** Generate low-res RGBA `DataTexture` (`SRGBColorSpace`) with `NearestFilter` on `MeshStandardMaterial`; avoid smooth vertex interpolation that fights crisp pixel edges.
- **Visual inspiration:** [Minecraft entity UV texel density](https://www.minecraft.net/) · [Signalis / Crow Country crisp lo-fi textures](https://en.wikipedia.org/wiki/Signalis) · [Three.js NearestFilter docs](https://threejs.org/docs/pages/Texture.html)
- **Technical limits:** Some external `.glb` viewers force mipmapping/linear filtering unless samplers explicitly encode `NEAREST`; verify texel crispness after GLB reload.

---

## Rendering styles

### Toon Shading
- **Visual traits:** Hard stepped light/shadow bands (2–3 crisp cel zones instead of smooth PBR falloff), punchy readable silhouettes, graphic color separation.
- **Geometry rules:** Avoid high-frequency noisy bump/jitter that breaks cel shadow terminators into confetti; use clean broad planes and readable rounded/faceted volumes.
- **Materials & palette:** Vibrant clean albedos (`<= 85%` brightness so highlights don't clip), flat colors or clean painted atlases; pick shadow hue temperature slightly cooler/warmer than lit face.
- **Three.js implementation:** Use built-in `MeshToonMaterial` with a small 2–4 pixel 1D `DataTexture` `gradientMap` (`RedFormat` or RGBA, `NearestFilter`, `generateMipmaps = false`) + strong key `DirectionalLight` and optional optional thin dark rim contrast. No custom GLSL needed.
- **Visual inspiration:** [The Legend of Zelda: The Wind Waker](https://en.wikipedia.org/wiki/The_Legend_of_Zelda:_The_Wind_Waker) · [Hi-Fi Rush cel shading](https://en.wikipedia.org/wiki/Hi-Fi_Rush) · [Three.js MeshToonMaterial](https://threejs.org/docs/pages/MeshToonMaterial.html)
- **Technical limits:** **`MeshToonMaterial` cel ramp is preview-only:** `GLTFExporter` falls back to `MeshStandardMaterial` (`pbrMetallicRoughness`), losing quantized gradient steps on exported `.glb` files.

### Anime Shading
- **Visual traits:** High-contrast 2-step cel shadows paired with crisp warm rim-light highlights, clean facial planes (zero messy nose shadows), expressive eye catchlights, vibrant hair/cloth streaks.
- **Geometry rules:** Simplify chin/cheek curves and model dedicated front hair chunks + recessed stylized eyes so frontal lighting never casts harsh zig-zag shadows across the face; split armor edges sharply.
- **Materials & palette:** Luminous skin/clothing bases paired with saturated shadow hues, multi-tone hair shine bands (`DataTexture`), bright unlit eye highlights (`MeshBasicMaterial` or emissive iris accents).
- **Three.js implementation:** Built-in `MeshToonMaterial` (2-band `NearestFilter` gradient ramp) + dedicated strong directional rim light (`intensity 1.2–1.6`) + optional `BackSide` ink outline shell in preview. Keep smooth face normals clean on cheeks.
- **Visual inspiration:** [Guilty Gear Strive / Arc System Works shading](https://en.wikipedia.org/wiki/Guilty_Gear_Strive) · [Genshin Impact stylized anime lighting](https://en.wikipedia.org/wiki/Genshin_Impact) · [Trigger / Studio anime cel clarity](https://en.wikipedia.org/wiki/Promare)
- **Technical limits:** Like Toon Shading, ramp quantization and preview rim setups do not persist verbatim inside standard glTF PBR; document `.glb` material behavior separately from the preview studio.

### Comic Ink
- **Visual traits:** Bold variable-weight black ink contours, graphic crosshatching/Ben-Day accents, high-contrast ink shadows (inspired by Moebius, Sable, and Spider-Verse).
- **Geometry rules:** Sharp crease delineation and clean convex silhouettes; avoid jagged overlapping micro-geometry that causes double ink flickering.
- **Materials & palette:** Quantized flat or 3-band toon fills (`MeshToonMaterial`) paired with procedural hatched `DataTexture` shadows + pure ink outlines (`#0d1017`).
- **Three.js implementation:** Use built-in `EdgesGeometry` (`thresholdAngle` `25°–35°`) for crisp architectural/hard-surface ink lines, or preview-only inverted-hull (`side: THREE.BackSide`) dark outline clones on organic parts + `MeshToonMaterial`. Zero external post-processing packages required.
- **Visual inspiration:** [Sable Moebius ink aesthetic](https://en.wikipedia.org/wiki/Sable_(video_game)) · [Spider-Man: Into the Spider-Verse](https://en.wikipedia.org/wiki/Spider-Man:_Into_the_Spider_Verse) · [Three.js EdgesGeometry](https://threejs.org/docs/pages/EdgesGeometry.html)
- **Technical limits:** Inverted-hull clones double triangle counts and create inward-winding shells if left inside exported `.glb`; keep preview outline meshes in a separate non-exported overlay or document explicitly before exporting.

### Painterly
- **Visual traits:** Soft impasto brushstroke energy, broken color transitions between planes, atmospheric color harmony (Arcane / Dishonored hand-crafted digital painting feel).
- **Geometry rules:** Clean faceted-to-medium organic topology (`PartBuilder` with `uv: 'box'` or semantic atlas); slightly asymmetrical silhouette accents prevent sterile CAD uniformity.
- **Materials & palette:** Rich matte-to-satin variance (`roughness 0.68–0.88`) modulated by a painterly `roughnessMap`, layered complementary color dabs baked cleanly into `DataTexture` / vertex tinting.
- **Three.js implementation:** Paint directional multi-stroke pixels procedurally into an albedo `DataTexture` (`SRGBColorSpace`) combined with subtle surface `roughnessMap` (`NoColorSpace`) on `MeshStandardMaterial`; enhance with warm/cool fill lights.
- **Visual inspiration:** [Arcane painted keyframes & characters](https://en.wikipedia.org/wiki/Arcane_(TV_series)) · [Dishonored painterly oil world](https://en.wikipedia.org/wiki/Dishonored) · [Disco Elysium brushstroke atmosphere](https://en.wikipedia.org/wiki/Disco_Elysium)
- **Technical limits:** Heavy screen-space oil-paint post-filters ruin crisp HUD and detail visibility and do not export to `.glb`; carry the brushwork directly in textures and vertex tonal shifts instead.

### Watercolor
- **Visual traits:** Soft pigment blooms, translucent wet-edge pooling (darker pigment rings along silhouette rims), creamy paper base showing through highlights.
- **Geometry rules:** Gentle silhouettes with softly rounded corners; keep polygon edges clean so vertex gradient bleeding doesn't create harsh triangular stripes.
- **Materials & palette:** High-value pastel-to-mid washes, slight paper grain texture (`roughness 0.90–0.96`), wet-edge darkening simulated around seams or via procedural wash `DataTexture`.
- **Three.js implementation:** Build a procedural mottled wash + cold-press paper `DataTexture` (`CanvasTexture` or seeded `DataTexture`) applied to `MeshStandardMaterial` (or soft 3-step `MeshToonMaterial`), keeping lighting high-key and shadows soft/warm rather than pitch black.
- **Visual inspiration:** [Gris watercolor visual art](https://en.wikipedia.org/wiki/Gris) · [Okami ink & wash harmony](https://en.wikipedia.org/wiki/%C5%8Ckami) · [Dordogne watercolor backdrops](https://en.wikipedia.org/wiki/Dordogne_(video_game))
- **Technical limits:** Real wet-paper blending relies on screen-space composite passes that stay preview-only; preserve the washed pigment transitions in texture/vertex color so the `.glb` keeps its gentle palette.

### Retro PS1
- **Visual traits:** Authentic 32-bit nostalgic crust—ultra-low vertex counts (`80–450` tris), crisp unfiltered blocky pixels (`NearestFilter`), flat vertex-lit mood shading, no modern normal/roughness gloss.
- **Geometry rules:** Embrace coarse angular joints, minimal segment cylinders (`5–6` sides), boxy hands/feet, and simple rigid hierarchy or un-blended bone pivots.
- **Materials & palette:** `roughness 0.95`, `metalness 0`, baked vertex lighting mood + crisp `32×32` or `64×64` `NearestFilter` `DataTexture` (`generateMipmaps = false`), darkened shadow crevices.
- **Three.js implementation:** Use built-in `MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true })` or `MeshLambertMaterial` with low-res `NearestFilter` `DataTexture`. Skip heavy custom vertex-snapping GLSL shaders unless preview-only retro jitter is explicitly asked.
- **Visual inspiration:** [Metal Gear Solid PS1 geometry clarity](https://en.wikipedia.org/wiki/Metal_Gear_Solid_(1998_video_game)) · [Silent Hill PS1 moody low-poly](https://en.wikipedia.org/wiki/Silent_Hill_(video_game)) · [Pseudoregalia retro 3D](https://en.wikipedia.org/wiki/Low_poly)
- **Technical limits:** Intentional vertex jitter shaders break standard glTF material compatibility and look distracting in studio inspection UIs; treat runtime vertex-snap strictly as opt-in preview flair.

### Realistic PBR
- **Visual traits:** Physically accurate light interaction, crisp specular separation between metals, leather, stone, glass, and fabric, real geometric bevels and seam depth.
- **Geometry rules:** Support silhouettes with real edge chamfers, bolted hardware, cloth thickness, and `>= 12–24` curved cylinder/sphere segments sized cleanly within the target budget.
- **Materials & palette:** Physically grounded roughness/metalness values (`dielectric metalness = 0`, `raw metal = 0.85–1.0`, weathered surfaces `roughness 0.35–0.85`), realistic albedo reflectance (avoid pure `#ffffff` or pure `#000000` albedos; stay in `~#141414–#e0e0e0`), paired with procedural `roughnessMap`/`bumpMap`.
- **Three.js implementation:** `MeshStandardMaterial` (or `MeshPhysicalMaterial` for `transmission` glass in preview) lit with `RoomEnvironment` IBL + `ACESFilmicToneMapping` + fitted `PCFShadowMap` shadows.
- **Visual inspiration:** [Three.js glTF PBR physically-based workflow](https://threejs.org/docs/pages/MeshStandardMaterial.html) · [glTF 2.0 Metallic-Roughness spec](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html#metallic-roughness-material)
- **Technical limits:** Pure PBR realism demands multi-channel calibrated textures and clean UV unwrap to look believable close up; stay tightly within hero/prop triangle ceilings.

---

## Art direction

### Cozy Pastel
- **Visual traits:** Inviting rounded comfort, soft warm sunbeams, gentle low-contrast pastel harmony (`cream`, `sage`, `peach`, `powder blue`), zero harsh black shadows.
- **Geometry rules:** Soften corners everywhere (`CapsuleGeometry`, thick beveled edges, plump creature proportions); avoid razor spikes or aggressive angular silhouette breaks.
- **Materials & palette:** Matte-to-satin finish (`roughness 0.72–0.88`), bright warm neutral key light + cool sky fill, tinted mid-tone crevice shading (lavender/warm taupe instead of pure black `#000000`).
- **Three.js implementation:** `MeshStandardMaterial` with lifted shadow-pocket colors and balanced `HemisphereLight`; verify silhouette clarity on **light** backdrops so pale cream features keep subtle darker rims.
- **Visual inspiration:** [Animal Crossing relaxing palette](https://en.wikipedia.org/wiki/Animal_Crossing:_New_Horizons) · [A Short Hike cozy colors](https://en.wikipedia.org/wiki/A_Short_Hike) · [Unpacking warm interiors](https://en.wikipedia.org/wiki/Unpacking_(video_game))
- **Technical limits:** Pale pastel features (`#f7efe2`) risk disappearing on light studio backgrounds unless framed by subtle darker outline seams or warm-tinted contact shadows.

### Fantasy
- **Visual traits:** Enchanted silhouette storytelling—ornate runes, sweeping horns/wings, crystal accents, warm bronze/gold trim contrasting deep jewel/arcane tones.
- **Geometry rules:** Layer heroic focal silhouettes (`hero/creature` proportions, asymmetrical shoulder pauldrons, curved blades/horns, floating rune rings on independent anim pivots).
- **Materials & palette:** Deep jewel tones (emerald, sapphire, crimson) + brushed antique gold (`metalness 0.85`, `roughness 0.32`) + glowing mana/crystal veins (`MeshBasicMaterial` / `emissive`, 3-tier contrast).
- **Three.js implementation:** Pair `MeshStandardMaterial` armor/cloth with unlit or `emissive` rune accents; anchor swirling aura/spark particles to live `root`/weapon bones in `_studio_vfx`.
- **Visual inspiration:** [Elden Ring ornate fantasy silhouettes](https://en.wikipedia.org/wiki/Elden_Ring) · [World of Warcraft: Dragonflight](https://en.wikipedia.org/wiki/World_of_Warcraft:_Dragonflight) · [Ori enchanted glow contrast](https://en.wikipedia.org/wiki/Ori_and_the_Blind_Forest)
- **Technical limits:** Excessive tiny ornaments bloat triangle counts fast and turn into noise from gameplay distance; group ornaments into clean Tier-1/Tier-2 silhouette chunks.

### Gothic
- **Visual traits:** Tall pointed arches, vertical tension, ironwork filigree, brooding midnight stone and crimson/violet accents, stark chiaroscuro silhouettes.
- **Geometry rules:** Elongate vertical proportions, sharp pointed spires/claws, layered tattered cape plates (`extrudeTris`), and heavy forged metal framing.
- **Materials & palette:** Dark slate, charcoal, tarnished silver/wrought iron (`metalness 0.7`, `roughness 0.55`), oxblood/violet cloth (`roughness 0.88`), pinpoint candle/ember glows (`toneMapped: false`).
- **Three.js implementation:** Prevent pure pitch-black crush (`>= #181c26` in linear-safe sRGB) so facets catch key + cool rim lighting cleanly in dark studio scenes; keep shadows crisp (`PCFShadowMap`).
- **Visual inspiration:** [Bloodborne gothic silhouette craft](https://en.wikipedia.org/wiki/Bloodborne) · [Darkest Dungeon chiaroscuro mood](https://en.wikipedia.org/wiki/Darkest_Dungeon) · [Hollow Knight sharp dark charm](https://en.wikipedia.org/wiki/Hollow_Knight)
- **Technical limits:** Very dark colors lose silhouette readability completely on dark `#0d1422` studio backdrops unless supported by a cool rim light (`#7cc8ff`) and lighter chamfered edges.

### Cyberpunk
- **Visual traits:** High-tech low-life density—exposed cables, carbon-fiber panels, weathered street grime paired with razor-sharp neon holographic emissive strips and wet sheen.
- **Geometry rules:** Combine chunky industrial boxes with diagonal tech bevels, exposed tubing (`tubeTris` hoses), antennae, and layered holographic fin decals (clearly marked or alpha-blended).
- **Materials & palette:** Dark graphite matte shells (`#1d222b`, `roughness 0.65`) + glossy wet trim (`roughness 0.18–0.28`) + saturated electric cyan/magenta/acid-lime emissives (`toneMapped: false`).
- **Three.js implementation:** Separate matte chassis, wet metallic vents, and crisp `MeshBasicMaterial` neon tubes/strips so emissive colors stay vivid across dark/light preview backdrops without clipping.
- **Visual inspiration:** [Cyberpunk 2077 industrial tech](https://en.wikipedia.org/wiki/Cyberpunk_2077) · [Ghostrunner sleek neon silhouettes](https://en.wikipedia.org/wiki/Ghostrunner) · [Stray cyberpunk props](https://en.wikipedia.org/wiki/Stray_(video_game))
- **Technical limits:** Neon emissives lose contrast on bright daylight/light studio backdrops unless framed inside deep charcoal recessed channels (`50–60%` dark anchor tier).

### Storybook
- **Visual traits:** Whimsical handcrafted proportion skews (tilted chimneys, oversized buttons, gentle S-curves), warm nostalgic color grading, approachable fairy-tale charm.
- **Geometry rules:** Deliberately slightly asymmetric/tapered boxes and curved roofs (`applyVertexJitter` subtle architectural bend or tapered loft arches), exaggerated prop landmarks (oversized locks, buckles, lanterns).
- **Materials & palette:** Warm ochre, mossy green, terracotta, cream (`roughness 0.80–0.92`), soft baked contact shading (`aoShade`) around doors, pockets, and joints, cozy warm emissive window/lantern glow.
- **Three.js implementation:** Combine skewed `taperedBoxTris`/`loftTris` silhouettes with matte `MeshStandardMaterial`, warm directional sun (`#fff1d6`), and subtle floating dust/firefly preview accents.
- **Visual inspiration:** [Fable fairy-tale proportions](https://en.wikipedia.org/wiki/Fable_(2004_video_game)) · [Studio Ghibli warmth](https://en.wikipedia.org/wiki/Studio_Ghibli) · [Tunic isometric storybook diorama](https://en.wikipedia.org/wiki/Tunic_(video_game))
- **Technical limits:** Too much random asymmetry or extreme skew can look broken rather than charming—ground structural pivots cleanly and keep paired limbs matching.

### Minimalist
- **Visual traits:** Radically distilled form, generous negative space, restrained 2–4 hue palette, architectural shadow gradients carrying 100% of the beauty with zero noise.
- **Geometry rules:** Pure silhouette discipline—every vertex and primitive earns its place; eliminate redundant micro-bolts, noisy textures, and decorative clutter.
- **Materials & palette:** Monochromatic or tightly curated analogous palette (`<= 4` flat tones), uniform architectural plaster/ceramic matte (`roughness 0.82–0.92`) plus one deliberate focal accent hue.
- **Three.js implementation:** Build clean crisp primitives or `PartBuilder` forms with minimal draw calls (`1–2` materials), flat or ultra-clean smooth normals, and balanced key-to-fill shadow contrast.
- **Visual inspiration:** [Journey sculptural simplicity](https://en.wikipedia.org/wiki/Journey_(2012_video_game)) · [Inside atmospheric minimalism](https://en.wikipedia.org/wiki/Inside_(video_game)) · [Monument Valley graphic silhouettes](https://en.wikipedia.org/wiki/Monument_Valley_(video_game))
- **Technical limits:** With zero texture noise hiding flaws, even tiny seam gaps, uneven normals, or off-center proportions become immediately obvious—rely strictly on silhouette & grounding QA.
