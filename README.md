# ThreeJS Modeling Skill (`threejs-asset-generator` v4)

Kumpulan panduan, kode pembangun dasar, dan alat pemeriksa otomatis untuk menghasilkan aset 3D gaya *low-poly* di **Three.js (r170+)** secara terukur dan konsisten (berbasis *seed* tetap), sekaligus mendukung pemeriksaan kualitas, perhitungan batas beban (*budget* & *LOD*), serta ekspor ke berkas `.glb`.

> **Catatan struktur:** Isi skill disimpan di dalam direktori [`threejs-asset-generator/`](./threejs-asset-generator/) agar nama foldernya sama persis dengan pengenal `name: threejs-asset-generator` di [`SKILL.md`](./threejs-asset-generator/SKILL.md) (syarat wajib dari pemeriksa `validate-skills.ts`).

---

## Status Pengerjaan Saat Ini

Berdasarkan catatan terakhir di [`HANDOFF.md`](./threejs-asset-generator/HANDOFF.md) (18 November 2026):

- **Selesai:** **Fase 0, 1, 2, 3, 4, dan 5**
  - **Fase 0–1 (Struktur Ringkas):** Panduan utama dipecah menjadi peta ringkas (`SKILL.md`), kode dipindah ke `src/`, dan dokumentasi mendalam ke `references/`.
  - **Fase 2 (Perkakas Uji):** Pemeriksaan terpadu lewat `tools/check.ts` (`validate-skills`, `trigger-check`, dan `run-tests`).
  - **Fase 3 (Gerbang QA & Pratinjau Visual):** Pemeriksa geometri murni (`qacheck.ts`) dan render pratinjau ortografis 4 sudut (`review.ts`, `qa-asset.ts`).
  - **Fase 4 (Budget & LOD):** Perhitungan batas segitiga/material/tekstur/memori per platform (`budget.ts`, `mesh-stats.ts`) dan dukungan tingkat detail bertingkat (`src/lod.ts`).
  - **Fase 5 (Ekspor GLB):** Pembuat dan pembaca berkas `.glb` murni tanpa Three.js maupun Blender (`scripts/glb.ts`, `scripts/export-glb.ts`).
- **Tahap Berikutnya (Belum Dikerjakan):**
  - **Fase 6:** Pemeriksa *rig* dan klip animasi (`rig-check` + `clip-check`).
  - **Fase 7:** Resep aset siap pakai (*recipe*).
  - **Fase 8:** Pengemasan akhir (`AGENTS.md`, `CLAUDE.md`, penyesuaian deskripsi & pemasangan).

---

## Struktur Direktori

```text
ThreeJS-modeling-skill/
├── README.md                        # Ringkasan repositori ini
├── .gitignore                       # Daftar berkas sementara yang diabaikan Git
├── .gitattributes                   # Penjaga konsistensi akhiran baris (LF)
└── threejs-asset-generator/         # Folder utama skill (65 berkas)
    ├── SKILL.md                     # Panduan utama & peta navigasi ke referensi
    ├── HANDOFF.md                   # Catatan teknis lengkap Fase 0–5 & daftar hal yang belum diuji
    ├── references/                  # 13 dokumen panduan topik (geometri, look, QA, budget, GLB, dll.)
    ├── src/                         # 24 berkas modul pembangun aset & unit test
    ├── scripts/                     # 17 berkas CLI pemeriksaan (QA, review, mesh-stats, export-glb, dll.)
    └── tools/                       # 7 berkas validator skill, trigger-check, dan runner pengujian
```

---

## Perintah Utama

Jalankan perintah berikut dari dalam direktori `threejs-asset-generator/` (membutuhkan **Node.js** dan **`tsx`**):

```bash
# 1. Menjalankan validasi skill, cek pemicu, dan seluruh unit test murni
tsx tools/check.ts

# 2. Menjalankan check mode ketat (menganggap skip karena `three` belum terpasang sebagai gagal)
tsx tools/check.ts --strict

# 3. Memeriksa kualitas aset & membuat gambar pratinjau 4 panel (review.png)
tsx scripts/qa-asset.ts --module ./kernel.ts --export buildXTris --symmetric

# 4. Memeriksa kepadatan poligon, batas platform, dan LOD
tsx scripts/mesh-stats.ts --module ./kernel.ts --export buildXTris --profile web --kind prop

# 5. Mengekspor aset ke format .glb (otomatis melewati gerbang QA lebih dulu)
tsx scripts/export-glb.ts --module ./kernel.ts --export buildXTris --out asset.glb
```

Detail parameter, contoh templat (`scripts/fixtures/crate.qa.ts`, `scripts/fixtures/dragon.qa.ts`), dan kontrak keluaran `@@RESULT` tersedia di masing-masing dokumen dalam [`references/`](./threejs-asset-generator/references/).

---

## Batasan yang Belum Terverifikasi

Mengacu pada catatan jujur di [`HANDOFF.md`](./threejs-asset-generator/HANDOFF.md), hal-hal berikut **belum diuji** pada paket v4 ini:
- Modul dan pengujian yang bergantung pada paket `three` (seperti `src/detailThree.test.ts`, `GLTFExporter`, dan `groupToTris`) karena `three` belum terpasang di lingkungan pengujian awal.
- Berkas `.glb` hasil ekspor `export-glb.ts` belum pernah dibuka langsung di aplikasi penampil pihak ketiga (`GLTFLoader`, Blender, atau `model-viewer`).

---

## Referensi Metodologi

Alur gerbang kualitas, pratinjau visual, dan verifikasi diadaptasi dari metodologi [EL4CTEO/blender-skills](https://github.com/EL4CTEO/blender-skills) (lisensi MIT, v1.3.2) dengan penyesuaian agar berjalan mandiri di ekosistem JavaScript/TypeScript tanpa menjadikan Blender sebagai dependensi.
