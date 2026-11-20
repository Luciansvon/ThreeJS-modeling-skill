# Handoff: threejs-asset-generator v3 → v4.1 (setelah Fase 4, 5, 6-awal & patch uji lapangan)

Tanggal: 20 Nov 2026. Status: **Fase 0, 1, 2, 3, 4, 5, dan patch lapangan v4.1 (PNG murni tanpa `sharp`, flood-fill + turnaround sheet, `lodRadiusScale`, `rig-check` R1–R6, panduan studio HTML, `package.json`, kompatibilitas Windows) selesai. Lanjut Fase 7 (recipe) dan 8 (packaging akhir).**

## Tujuan
Adopsi metodologi [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (MIT, v1.3.2, commit `9e7e04a`) ke skill `threejs-asset-generator`, tanpa menjadikan Blender dependensi.

## Keputusan
- Scope: **Track A saja** (metodologi, tanpa Blender). Track B (`threejs-blender-bridge`) ditunda.
- Struktur: **satu skill** yang dirampingkan.
- Target agen: **general/native** (bukan hanya Claude Code). Fase 8 memakai `AGENTS.md` sebagai inti, `CLAUDE.md` berisi `@AGENTS.md`, install ke `~/.claude/skills` dan `~/.agents/skills`.

## Sudah dikerjakan
**Fase 0 (baseline v3):** `SKILL.md` 727 baris ≈12.600 token, description 942 karakter.

**Fase 1 (diet struktur):** `SKILL.md` jadi router + §0–§3, §13, §14, §15; kode dipindah ke `src/` (20 file `.ts`), referensi ke `references/`. Empat bug v3 diperbaiki (export helper vektor `organic.ts`, `tubeTris` dengan `shape`, import `lowpoly.ts`, `dragonKernel.ts` dilengkapi).

**Fase 2 (tooling):** `tsx tools/check.ts [--strict]` menjalankan `validate-skills` + `trigger-check` + `run-tests` dengan satu verdict. Kontrak output: baris stdout TERAKHIR `@@RESULT {json}`; exit 0 = ok, 2 = gate gagal, 1 = salah pakai/error (`scripts/result.ts`). `trigger-check` adalah proxy leksikal BM25, bukan model bahasa.

**Fase 3 (gerbang QA + review visual), selesai:**
- `scripts/qacheck.ts`: gerbang murni atas array segitiga (tanpa THREE). Q1 finite · Q2 degenerate · Q3 winding · Q4 closed (tepi dilas, tiap tepi berarah punya pasangan) · Q5 budget · Q6 grounding · Q7 symmetry (opt-in, berbasis vertex) · Q8 determinism · Q9 seed 0.
- `scripts/review.ts`: renderer ortografis perangkat lunak (z-buffer, Lambert). Lembar 2×2: depan | samping / atas | 3/4. Segitiga yang membelakangi kamera tetapi paling dekat dicat **magenta** (inside-out, lubang, sheet yang lupa `--open`). Garis abu = Y 0.
- `scripts/qa-asset.ts`: CLI. `--module f.ts --export fn` (kernel murni; builder dipanggil beberapa kali, mengaktifkan Q8/Q9) atau `--tris tris.json` (aset akhir hasil `groupToTris`, Q8/Q9 dilaporkan UNVERIFIED). Menulis `review.png`, menambah Q10 (visible faces) dari gambar, mencetak tabel gate, baris `@@RESULT`. Opsi: `--budget --open a,b|all --symmetric --grounded --footprint --ground-y --out --no-render`.
- `scripts/fixtures/crate.qa.ts`: builder terkecil yang lengkap (juga templat).
- Tes: `scripts/qacheck.test.ts` (kasus lulus DAN tiap cacat yang harus gagal, plus CLI end-to-end dan kode keluar) dan `src/qa.kernel.test.ts` (gerbang melawan kernel nyata skill ini).
- Dokumen: `references/qa-gates.md` (baru, tertaut dari router). `SKILL.md` §13 sekarang punya perintah QA yang bisa dijalankan, **aturan "Done"** (QA lulus pada build terkini, `review.png` benar-benar dibuka dengan tool view dan ada satu temuan per panel, semua `UNVERIFIED`/`not checked` diulang di jawaban, tabel gate terakhir di akhir jawaban), dan satu butir checklist QA.
- Hijau saat ini: `validate-skills` 0 error 0 warning (SKILL.md 184 baris, ≈3.330 token, description 320 karakter); `trigger-check` 13/13; `run-tests` 7 lulus, 1 skip (`src/detailThree.test.ts`); `check` exit 0; `check --strict` exit 2 hanya karena `three` hilang. 20.000 segitiga diproses ±0,85 detik, termasuk 8 kali build.

**Fase 5 (export GLB), selesai:**
- `scripts/glb.ts`: penulis dan pembaca GLB murni (tanpa THREE, tanpa fs). `partsToGlb(parts)` menulis satu scene, satu node + satu mesh per part (nama = nama part), `POSITION` + `NORMAL` flat, non-indexed, float32, `min`/`max` tepat, satu material default. `readGlb` dan `glbGates` membaca balik.
- `scripts/export-glb.ts`: CLI. `--module f.ts --export fn` atau `--tris tris.json`, `--out`, `--open`, `--budget`, `--color r,g,b`, `--skip-qa`. Menjalankan ulang Q1–Q5 lebih dulu dan menolak menulis file untuk aset non-finite / inside-out / terbuka; lalu menulis file, **membaca ulang dari disk**, dan menjalankan E1 container · E2 json · E3 accessors · E4 round-trip · E5 normals · E6 counts. Baris `@@RESULT` terakhir; exit 0/2/1 seperti skrip lain.
- `scripts/glb.test.ts`: kasus lulus, determinisme (seed 0 = aset sendiri), input buruk ditolak, tiap cacat harus gagal (magic, versi, panjang, file terpotong, JSON rusak, vertex berubah, segitiga hilang, nama part berubah, normal dibalik, min/max salah), input inside-out terlihat di normal, dan CLI end-to-end (kode keluar, penolakan QA, `--skip-qa` tercatat, sheet butuh `--open`, error usage/load).
- Dokumen: `references/glb-export.md` (baru), tertaut dari router; `SKILL.md` §16 dan satu butir checklist.
- Diuji: tes ditulis lalu **dimutasi** (normal dibalik, segitiga terakhir dibuang, min dinolkan): ketiganya ketahuan. Satu kali silang-cek dengan pembaca independen (Python `struct` + `numpy`) pada crate: container, min/max, normal, volume bertanda cocok. Kernel naga nyata (lewat pembungkus sementara, wing di `--open`): E1–E6 lulus, 388 segitiga, 30.856 byte. 20.000 segitiga: 1.440.900 byte, ±0,4 detik termasuk start `tsx`.
- Hijau: `validate-skills` 0 error 0 warning (SKILL.md 190 baris, ≈3.513 token, description 320 karakter, 12 referensi); `trigger-check` 13/13; `run-tests` 8 lulus, 1 skip; `check` exit 0.

**Belum terverifikasi (Fase 5):**
- GLB belum pernah dibuka di loader/viewer pihak ketiga (`GLTFLoader`, Blender, model-viewer, validator glTF resmi). E1–E6 membandingkan file dengan inputnya lewat pembaca buatan skill ini; silang-cek Python hanya sekali, bukan gerbang.
- Hanya geometri: tidak ada `COLOR_0`, UV, tekstur, material per part, skin, tulang, atau animasi. Warna per part adalah langkah wajar berikutnya (belum dikerjakan; kandidat Fase 4/6).
- Jalur `GLTFExporter` (sisi THREE) tidak ditulis dan tidak diuji; tetap UNVERIFIED sampai `three` terpasang.
- `description` SKILL.md belum menyebut GLB. Menambahkannya mengubah skor `trigger-check` dan belum diputuskan; kasus "export as .glb" juga belum ada di `tools/trigger-cases.json`. Putuskan di Fase 8 bersama sinyal lemah "village".
- (Diselesaikan di Fase 4) pembungkus kernel `(p, rng)` kini ada: `scripts/fixtures/dragon.qa.ts`.

**Fase 4 (budget + LOD), selesai** (plan §3.4):
- `scripts/budget.ts` (murni, tanpa THREE/fs): tabel `PROFILES` (mobile, web, vr, desktop; hero/prop; tiap batas = ujung ATAS rentang plan, ujung bawah = target dan hanya jadi catatan "above the target"), `textureMiB` (RGBA8 + mip chain: 1k 5,33 · 2k 21,33 · 4k 85,33 MiB, sama dengan angka plan), `assetStats`, `budgetGates` B1 triangles · B2 materials · B3 textures · B4 bones · B5 draw calls · B6 GLB size, dan `lodGates` L0–L4.
- `scripts/mesh-stats.ts`: CLI. `--module`/`--tris`, `--profile` (default web), `--kind prop|hero` (default prop), `--meta meta.json` (material + bone per part, tekstur, bone), `--glb file`, `--open`, `--symmetric`, `--lods`. Yang tidak bisa diketahui dari array segitiga dilaporkan `not checked`, tidak ditebak. Draw call tanpa meta = batas atas (satu per part) dan diberi label begitu. Vertex GPU = 3 × tris (flat non-indexed). Kontrak `@@RESULT`, exit 0/2/1.
- `src/lod.ts`: `detailParam` (0–2, default 2), `lodLevel` (`??`: 0 level nyata; NaN/teks → 2), `lodPick`. Dipasang di `src/dragonKernel.ts` (jumlah ring spline, sisi tube badan 4/6/8, sendi lutut dan sisi kaki). **Default tidak berubah**: hash seed 0/1/7/42 dicatat SEBELUM perubahan dan dikunci di `src/lod.test.ts`. Naga: 388 → 204 → 96 tris (rasio 0,53 · 0,47), bounds ≤1,1% panjang sisi terpanjang, sayap identik di semua level (stream di-fork), spike mengikuti jumlah ring.
- `scripts/fixtures/dragon.qa.ts`: pembungkus resmi untuk kernel bertanda tangan `(params, rng)`; menutup keterbatasan pembungkus sementara dari Fase 5.
- Tes: `scripts/budget.test.ts` (tabel, stats, tiap batas lulus di batas dan gagal satu di atasnya, kasus unknown → skipped, LOD: kernel nyata lulus; tiap cacat memicu gerbangnya sendiri dan hanya itu: builder mengabaikan `detail` → L1, rasio terlalu curam → L1, part hilang → L2, pivot bergeser → L3, build berbeda → L4, level berlubang → L0; CLI end-to-end) dan `src/lod.test.ts`. **Dimutasi**: 9 mutasi pada `budget.ts` (batas `<`, toleransi bounds 50%, jendela rasio dilebarkan, tekstur tanpa mip, draw call mengabaikan bone, L2 dan L4 selalu lulus, vertex GPU = tris, batas web diganti) semuanya ketahuan. Satu temuan saat menulis tes: pembangun cacat pertama saya salah (menghasilkan array kosong sehingga L3 gagal karena alasan keliru); diganti dengan builder satu-perubahan-per-cacat. Temuan lain: kotak yang saling menempel gagal Q4 (wajah berimpit), dan itu memang benar.
- Dokumen: `references/budget.md` (baru, tertaut dari router), `SKILL.md` §17 dan satu butir checklist.
- Hijau: `validate-skills` 0 error 0 warning (SKILL.md 196 baris, ≈3.779 token, description 320 karakter, 13 referensi); `trigger-check` 13/13; `run-tests` 10 lulus, 1 skip; `check` exit 0.

**Belum terverifikasi (Fase 4):**
- Semua angka **dihitung, bukan diukur**: tidak ada frame time, fill rate, overdraw, atau memori GPU nyata (tidak ada GPU/browser di sandbox).
- Dua ambang **dipilih di sini, bukan diturunkan dari plan**: jendela rasio LOD 0,35–0,65 dan toleransi bounds 5%. Dikalibrasi hanya pada naga.
- LOD baru terpasang di **kernel naga saja**. `biped.ts`, `detail.ts`, kernel lain belum punya `detail`. Helper dan gerbang bekerja di builder mana pun yang menerimanya.
- L2 membandingkan nama part sebagai proxy; material per level belum dibandingkan.
- Tidak dihitung: total scene (10–20 MB, draw call scene), draw call untuk vr/desktop dan ukuran GLB untuk prop/vr/desktop (plan tidak memberi batas, jadi tidak ada gerbang), kompresi tekstur.
- `PartBuilder.build` menggabung semua part satu builder menjadi satu mesh per material (dibaca dari `src/lowpoly.ts`, jalur THREE tidak dijalankan).
- `description` SKILL.md masih belum menyebut GLB atau budget (lihat keputusan tertunda Fase 5).

**Temuan dan perbaikan di Fase 3** (gerbang diuji pada kernel nyata, bukan hanya kotak buatan):
1. Q7 awalnya membandingkan himpunan segitiga dan salah menandai kotak simetris: diagonal quad tidak simetris cermin. Diganti ke perbandingan himpunan vertex hasil weld.
2. Sheet (kipas sayap) punya "volume" tak bermakna dan bisa negatif (sayap naga −0,13), bukan ≈0. Petunjuk Q3 dikoreksi: **Q4 yang membedakan** sheet (ada open edges) dari part inside-out (Q4 lulus).
3. Kernel mentah tidak ter-grounding (kaki naga turun ke Y −0,023, tube melewati titik kaki). Q6 sekarang aktif untuk `--tris`, mati untuk `--module` kecuali `--grounded`/`--footprint`, dan laporan menyebutnya di `not checked`.
4. **Tube dengan jumlah sisi ganjil tidak simetris cermin** bila cincin mulai di sumbu X (spine horizontal): segi-7 punya vertex di +X, sisi datar di −X. `dragonKernel.ts` memakai 7 untuk `body`; sekarang 8. Ini mengubah bentuk contoh itu sedikit (bukan hanya tes). Dikunci oleh `src/qa.kernel.test.ts`.
5. Sapuan 12 produsen mesh tertutup (`boxTris`, `taperedBoxTris`, `extrudeTris`, `loftTris`, `footTris`, `handTris`, `eyeTris`, `noseTris`, `earTris`, `sleeveTris`, `tubeTris`, `spikeTris`): semuanya lulus Q1–Q5, tidak ada false positive.

**Patch Uji Lapangan v4.1 (20 Nov 2026 — temuan dari pengujian nyata karakter rakun chibi):**
- **PNG murni tanpa `sharp` (`scripts/png.ts`):** Penulis PNG RGBA + pengubah skala nearest-neighbor + pembaca PNG 8-bit non-interlaced menggunakan `node:zlib` bawaan. `qa-asset.ts` kini selalu menulis `review.png`, `ref-compare.ts` selalu menulis `diff-<view>.png`, dan `ref-intake.ts` dapat membaca/menulis PNG tanpa harus memasang `sharp` (`sharp` tetap didukung sebagai opsi untuk JPEG/WebP).
- **Turnaround sheet & siluet flood-fill (`scripts/refcheck.ts`, `scripts/ref-intake.ts`):** `maskFromRGBA` kini memakai border flood-fill secara default agar area terang di dalam objek (seperti perut krem pada latar krem) tidak berlubang (`--no-flood` untuk mode lama). `ref-intake.ts` mendukung `--sheet <file> --grid 3x2 --views front,back,top,bottom,side,34` untuk memotong lembar karakter multi-sudut otomatis.
- **Kompensasi radius LOD (`src/lod.ts`):** Menambahkan `lodRadiusScale(sides, refSides)` agar penurunan sisi poligon 8 → 6 → 4 menjaga lebar/kedalaman batas bentuk (mencegah kegagalan gerbang `L3`). Diuji di `src/lod.test.ts`.
- **Gerbang rig, klip & ekspresi (`scripts/rigcheck.ts`, `scripts/rig-check.ts`, `scripts/rigcheck.test.ts`, `references/rig-check.md`):** Pemeriksa murni tanpa `three` untuk R1 hierarchy · R2 rest-pose · R3 clips (memastikan `RefPose` tidak bocor ke ekspor) · R4 tracks & in-place horizontal drift · R5 static expression mapping · R6 slide clearance (`dropPct >= 22%`, `minY >= -0.025m`).
- **Panduan studio pratinjau HTML (`references/studio-preview.md`) & akar `package.json`:** Menambahkan panduan pola studio HTML interaktif (kamera 6 sudut, kontras HUD di latar terang, uji bolak-balik GLB di RAM) serta `package.json` akar dengan skrip `npm run check|qa|stats|export-glb|rig-check|ref-intake|ref-compare`.
- **Kompatibilitas Windows (`scripts/result.ts` `spawnTsx`, `fileURLToPath`):** Memperbaiki `new URL(...).pathname` (bug garis miring awal di Windows), pola regex `HANDOFF.md` di `validate-skills.ts`, dan pemanggilan `tsx` lintas OS tanpa shell-quoting bug pada argumen JSON.
- **Hijau di Windows (Node v24 + `npx tsx`):** `validate-skills` 0 error 0 warning (SKILL.md 202 baris, ≈3.965 token, 15 referensi); `trigger-check` 13/13; `run-tests` **11 lulus, 0 gagal, 1 skip** (`src/detailThree.test.ts` karena `three` belum terpasang); `check` exit 0.

## Cara menjalankan
```
tsx scripts/rig-check.ts --meta char_metadata.json
tsx scripts/ref-intake.ts --sheet sheet.png --grid 3x2 --views front,back,top,bottom,side,34 --out ref.json
tsx scripts/mesh-stats.ts --module ./kernel.ts --export buildXTris --profile web --kind prop [--lods]
tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb
tsx tools/check.ts                 # semua, satu verdict
tsx tools/check.ts --strict        # skip karena `three` hilang dianggap gagal
tsx scripts/qa-asset.ts --module ./kernel.ts --export buildXTris --symmetric
tsx scripts/qa-asset.ts --tris tris.json --footprint
```

## Belum terverifikasi
- `src/detailThree.test.ts` dan seluruh sisi THREE belum pernah dijalankan (paket `three` tidak ada di sandbox, tanpa jaringan). Perlu `npm i three`, lalu `tsx tools/check.ts --strict`.
- Daftar "Not verified" di `references/detail.md` masih berlaku (`DataTexture` lewat `GLTFExporter`, `bumpMap` + `flatShading`, `RigBuilder` + atlas UV).
- `groupToTris` (`references/reference-matching.md` §5) belum pernah dijalankan, jadi jalur `qa-asset --tris` hanya diuji dengan `tris.json` buatan tangan, bukan keluaran grup THREE sungguhan.
- **Toleransi Q10 (4 piksel magenta per part) dipilih dari satu pengamatan**: 1 piksel di panel 3/4 pada crate seed 42, di jahitan tempat dua part tertutup berpotongan; seed 0, 1, 2, 3, 101 bersih. Belum dikalibrasi pada aset lain.
- Q9 memakai himpunan seed tetap `[1, 2, 42, 101, 12345]`: mendeteksi alias seed 0 → seed lain dari himpunan itu, bukan alias ke sembarang fallback.
- Renderer review belum dibandingkan dengan render THREE. Ia menunjukkan bentuk dan winding, bukan material, tekstur, atau rigging. Empat kamera semuanya di sisi +X/+Y/+Z, sehingga sisi jauh tidak terlihat (Q3/Q4 yang menutupinya).
- Aturan "gambar review benar-benar dilihat" tidak bisa dipaksa oleh script; itu aturan di dokumen, script hanya mencetak instruksinya.
- Sinyal lemah dari Fase 2 belum diubah: prompt "Compose a village from generated houses and trees..." menang tipis (1,20 vs min 1,0). Putuskan di Fase 8 atau saat tuning description (sisa ±80 karakter sampai batas 400).
- Token dihitung kasar (byte ÷ 4).

## Langkah berikut
Urutan: **Fase 6** (rig-check + clip-check), lalu 7 (recipe), 8 (packaging). Detail ada di plan asli (`plan-integrasi-blender-skills`, §3). Script baru memakai kontrak `@@RESULT`, didaftarkan di `references/`, dan harus lolos `tsx tools/check.ts`. Sisi THREE (termasuk `GLTFExporter`) tetap UNVERIFIED sampai `three` terpasang.

## Catatan
- Sandbox tanpa jaringan. `tsx`, `tsc`, `sharp`, `playwright` ada global. `three` tidak ada. `tsc` mengeluhkan tipe Node (tidak ada `@types/node`); itu noise lingkungan.
- `tsx -e` memakai CJS (tanpa top-level await): untuk probe sekali pakai, tulis file `.ts` di folder yang ber-`"type": "module"` lalu hapus. Shell tool adalah `sh`, bukan bash (tidak ada `PIPESTATUS` atau `time`).
- Bila ada teks yang disalin dari blender-skills, sertakan notice MIT.
